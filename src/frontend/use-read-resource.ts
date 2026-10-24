"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { readApi, type ReadError } from "./api";

type Resource<T> = { key: string; status: "loading" } | { key: string; status: "ready"; data: T } | { key: string; status: "error"; error: ReadError };
export function useReadResource<T>(path: string, schema: z.ZodType<T>, expiry: (data: T) => string, expiredCode: "SESSION_EXPIRED" | "TRACE_EXPIRED") {
  const [state, setState] = useState<Resource<T>>({ key: path, status: "loading" });
  const [revision, setRevision] = useState(0);
  const busy = useRef(false);
  const sequence = useRef(0);
  const refresh = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setState({ key: path, status: "loading" });
    setRevision(value => value + 1);
  }, [path]);
  useEffect(() => {
    const controller = new AbortController();
    const request = ++sequence.current;
    busy.current = true;
    setState({ key: path, status: "loading" });
    void readApi(path, schema, controller.signal).then(result => {
      if (controller.signal.aborted || request !== sequence.current) return;
      busy.current = false;
      if (result.ok && Date.parse(expiry(result.data)) > Date.now()) setState({ key: path, status: "ready", data: result.data });
      else setState({ key: path, status: "error", error: result.ok ? { code: expiredCode } : result.error });
    });
    return () => { controller.abort(); };
  }, [path, revision, schema, expiry, expiredCode]);
  const deadline = state.status === "ready" ? Date.parse(expiry(state.data)) : null;
  useEffect(() => {
    if (deadline === null) return;
    const expire = () => {
      if (Date.now() >= deadline) setState({ key: path, status: "error", error: { code: expiredCode } });
    };
    const timer = setTimeout(expire, Math.min(2147483647, Math.max(0, deadline - Date.now())));
    window.addEventListener("pageshow", expire);
    document.addEventListener("visibilitychange", expire);
    return () => { clearTimeout(timer); window.removeEventListener("pageshow", expire); document.removeEventListener("visibilitychange", expire); };
  }, [deadline, path, expiredCode]);
  const current: Resource<T> = state.key !== path ? { key: path, status: "loading" }
    : state.status === "ready" && deadline !== null && deadline <= Date.now() ? { key: path, status: "error", error: { code: expiredCode } } : state;
  return { resource: current, refresh };
}

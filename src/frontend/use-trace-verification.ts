"use client";
import { useEffect, useRef, useState } from "react";
import type { PublicTraceResponse, PublicTraceVerificationResponse, TraceEvent } from "@/shared/trace-contracts";
import { readApi, type ReadError } from "./api";
import { publicVerificationSchema } from "./trace-models";

export type CurrentVerification = { status: "loading" } | { status: "error"; error: ReadError } | { status: "ready"; data: PublicTraceVerificationResponse };
/** One explicit GET at a time. Responses are transient and tied to the visible preparation. */
export function useTraceVerification(trace: PublicTraceResponse, invalidate: (error: ReadError) => void, changed: () => void) {
  const [results, setResults] = useState<Record<string, CurrentVerification>>({});
  const [busyEvent, setBusyEvent] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null), lock = useRef(false), active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; request.current?.abort(); }; }, []);
  async function verify(event: TraceEvent) {
    if (lock.current) return;
    if (Date.parse(trace.expiresAt) <= Date.now()) { invalidate({ code: "TRACE_EXPIRED" }); return; }
    lock.current = true; setBusyEvent(event.eventId);
    setResults(previous => ({ ...previous, [event.eventId]: { status: "loading" } }));
    const controller = new AbortController(); request.current = controller;
    try {
      const result = await readApi(`/api/traces/${trace.traceId}/events/${event.eventId}/verification`, publicVerificationSchema, controller.signal, "omit");
      if (!active.current || controller.signal.aborted) return;
      if (Date.parse(trace.expiresAt) <= Date.now()) { invalidate({ code: "TRACE_EXPIRED" }); return; }
      if (!result.ok) {
        if (["NOT_FOUND", "TRACE_EXPIRED"].includes(result.error.code)) { invalidate(result.error); return; }
        if (result.error.code === "VERSION_CONFLICT") { changed(); return; }
        setResults(previous => ({ ...previous, [event.eventId]: { status: "error", error: result.error } })); return;
      }
      const data = result.data;
      if (data.traceId !== trace.traceId || data.eventId !== event.eventId) {
        setResults(previous => ({ ...previous, [event.eventId]: { status: "error", error: { code: "INVALID_RESPONSE" } } })); return;
      }
      if (Date.parse(data.expiresAt) <= Date.now()) { invalidate({ code: "TRACE_EXPIRED" }); return; }
      if (data.payloadVersion !== event.payloadVersion || data.expiresAt !== trace.expiresAt
        || data.publication.topicId !== event.publication.topicId || data.publication.transactionId !== event.publication.transactionId
        || data.integrity.storedDigest !== event.integrity.storedDigest || data.integrity.localDigest !== event.integrity.localDigest) { changed(); return; }
      const evidence = data.observation?.evidence;
      if (evidence && (evidence.transactionId !== data.publication.transactionId || evidence.topicId !== data.publication.topicId || evidence.localDigest !== data.integrity.localDigest)) {
        setResults(previous => ({ ...previous, [event.eventId]: { status: "error", error: { code: "INVALID_RESPONSE" } } })); return;
      }
      setResults(previous => ({ ...previous, [event.eventId]: { status: "ready", data } }));
    } finally {
      if (active.current && !controller.signal.aborted) { lock.current = false; request.current = null; setBusyEvent(null); }
    }
  }
  return { results, busyEvent, verify };
}

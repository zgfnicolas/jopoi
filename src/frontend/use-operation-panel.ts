"use client";
import { useEffect, useRef, useState } from "react";
import type { DemoRunResponse } from "@/shared/run-contracts";
import type { OperationCommand } from "@/shared/operation-contracts";
import { API_ERROR_CATALOG } from "@/shared/api-errors";
import { readApi, type ReadError } from "./api";
import { postOperation, type MutationError } from "./operation-api";
import { commandResponseSchema, operationViewSchema, retryResponseSchema, runIntentSchema, sessionResponseSchema } from "./operation-models";

type Intent = { kind: "bootstrap" | "start" | "reset" | "command" | "retry"; path: string; body: string; traceId?: string; eventId?: string; action?: OperationCommand["action"]; expectedVersion?: number };
type PublicLink = { traceId: string; expiresAt: string };
const currentPath = "/api/demo/runs/current";
const retryMessages = { ALREADY_CONFIRMED: "El hito ya estaba confirmado en testnet.", BLOCKED: "El envío espera un hito anterior.",
  RECONCILE_ONLY: "Se solicitó comprobar el envío incierto; no se autorizó otro envío.", MANUAL_AUTHORIZED: "El intento adicional quedó autorizado. Esto todavía no confirma el envío.",
  EXHAUSTED: "Se agotaron los intentos de este hito.", AUTOMATIC_PENDING: "Se solicitó procesar el trabajo elegible. La publicación sigue pendiente." };
function errorMessage(error: ReadError | MutationError) {
  return error.code in API_ERROR_CATALOG ? API_ERROR_CATALOG[error.code as keyof typeof API_ERROR_CATALOG].message : "No recibimos una respuesta válida. Revisá la conexión y volvé a intentar.";
}

/** SQL snapshots and one captured intent. No optimistic operation, polling or durable browser storage. */
export function useOperationPanel() {
  const [data, setData] = useState<DemoRunResponse | null>(null);
  const [error, setError] = useState<ReadError | MutationError | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true), [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false), [stale, setStale] = useState(false);
  const [links, setLinks] = useState<PublicLink[]>([]);
  const [draftRevision, setDraftRevision] = useState(0);
  const snapshot = useRef<DemoRunResponse | null>(null), pending = useRef<Intent | null>(null);
  const lock = useRef(false), active = useRef(false), generation = useRef(0);
  const controller = useRef<AbortController | null>(null), path = useRef(currentPath);
  const resetDraftOnRead = useRef(false);
  function remember(run: PublicLink) {
    const link = { traceId: run.traceId, expiresAt: run.expiresAt };
    setLinks(previous => [...previous.filter(item => item.traceId !== link.traceId && Date.parse(item.expiresAt) > Date.now()), link]);
  }
  function expire() {
    generation.current++; controller.current?.abort(); pending.current = null; snapshot.current = null;
    lock.current = false; setBusy(false); setData(null); setUncertain(false); setConflict(false); setStale(false);
    setMessage(""); setError({ code: "SESSION_EXPIRED" }); setDraftRevision(value => value + 1);
  }
  function accept(value: DemoRunResponse) {
    const deadline = Math.min(Date.parse(value.session.expiresAt), value.run ? Date.parse(value.run.expiresAt) : Infinity);
    if (deadline <= Date.now()) { expire(); return false; }
    snapshot.current = value; setData(value); setStale(false);
    if (resetDraftOnRead.current) { resetDraftOnRead.current = false; setDraftRevision(revision => revision + 1); }
    if (value.run) remember(value.run);
    return true;
  }
  async function load(signal: AbortSignal) {
    const result = await readApi(path.current, operationViewSchema, signal);
    if (!active.current || signal.aborted) return false;
    if (result.ok) { if (!accept(result.data)) return false; setError(null); return true; }
    if (["SESSION_REQUIRED", "SESSION_EXPIRED", "NOT_FOUND"].includes(result.error.code)) {
      pending.current = null; snapshot.current = null; setData(null); setUncertain(false); setConflict(false);
      setDraftRevision(value => value + 1);
    }
    setError(result.error); setStale(true); return false;
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    const request = new AbortController(); controller.current = request;
    try { await load(request.signal); }
    finally { if (active.current && !request.signal.aborted) { lock.current = false; setBusy(false); } }
  }
  useEffect(() => {
    active.current = true; lock.current = true;
    const request = new AbortController(); controller.current = request;
    void load(request.signal).finally(() => { if (active.current && !request.signal.aborted) { lock.current = false; setBusy(false); } });
    return () => { active.current = false; generation.current++; request.abort(); controller.current?.abort(); };
    // The initial read is the only mount effect. Every write requires an explicit click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const deadline = data ? Math.min(Date.parse(data.session.expiresAt), data.run ? Date.parse(data.run.expiresAt) : Infinity) : null;
  useEffect(() => {
    if (deadline === null) return;
    const check = () => { if (Date.now() >= deadline) expire(); };
    const timer = setTimeout(check, Math.min(2147483647, Math.max(0, deadline - Date.now())));
    window.addEventListener("pageshow", check); document.addEventListener("visibilitychange", check);
    return () => { clearTimeout(timer); window.removeEventListener("pageshow", check); document.removeEventListener("visibilitychange", check); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline]);

  async function execute(intent: Intent) {
    if (lock.current) return;
    if (snapshot.current && Math.min(Date.parse(snapshot.current.session.expiresAt), snapshot.current.run ? Date.parse(snapshot.current.run.expiresAt) : Infinity) <= Date.now()) { expire(); return; }
    lock.current = true; pending.current = intent; setBusy(true); setError(null); setMessage("");
    const request = new AbortController(); controller.current = request;
    const epoch = generation.current;
    const alive = () => active.current && !request.signal.aborted && epoch === generation.current;
    function failure(problem: MutationError) {
      if (!alive()) return;
      setError(problem);
      if (problem.status === null || problem.code === "INVALID_RESPONSE" || (problem.status ?? 0) >= 500) { setUncertain(true); return; }
      pending.current = null; setUncertain(false);
      if (["SESSION_REQUIRED", "SESSION_EXPIRED", "NOT_FOUND"].includes(problem.code)) {
        snapshot.current = null; setData(null); setStale(true); setDraftRevision(value => value + 1);
      } else if (["VERSION_CONFLICT", "STATE_CONFLICT", "IDEMPOTENCY_CONFLICT"].includes(problem.code)) setConflict(true);
    }
    try {
      if (intent.kind === "bootstrap") {
        // A lost response may already have installed the HttpOnly cookie. Recover before replacing it.
        const existing = await readApi("/api/demo/session", sessionResponseSchema, request.signal);
        if (!alive()) return;
        if (!existing.ok && !["SESSION_REQUIRED", "SESSION_EXPIRED"].includes(existing.error.code)) {
          setError(existing.error); setUncertain(true); return;
        }
        if (!existing.ok) {
          const begun = await postOperation(intent.path, intent.body, sessionResponseSchema, [200, 201], request.signal);
          if (!alive()) return;
          if (!begun.ok) { failure(begun.error); return; }
        }
        intent = { kind: "start", path: "/api/demo/runs", body: JSON.stringify({ requestId: crypto.randomUUID() }) };
        pending.current = intent;
      }
      let traceId = intent.traceId;
      if (intent.kind === "start" || intent.kind === "reset") {
        const result = await postOperation(intent.path, intent.body, runIntentSchema, [200, 201], request.signal);
        if (!alive()) return;
        if (!result.ok) { failure(result.error); if (conflictCodes(result.error.code) || result.error.code === "RUN_LIMIT_REACHED") { await load(request.signal); if (alive()) setError(result.error); } return; }
        traceId = result.data.run.traceId;
        remember(result.data.run);
        setMessage(result.data.created ? "El nuevo recorrido quedó guardado." : "Retomamos el recorrido guardado de esta intención.");
        resetDraftOnRead.current = true;
      } else if (intent.kind === "command") {
        const result = await postOperation(intent.path, intent.body, commandResponseSchema, [200], request.signal);
        if (!alive()) return;
        if (!result.ok) { failure(result.error); if (conflictCodes(result.error.code)) { await load(request.signal); if (alive()) setError(result.error); } return; }
        if (result.data.traceId !== intent.traceId || result.data.applied.version !== (intent.expectedVersion ?? 0) + 1
          || (result.data.event === null) !== (intent.action === "save")) { failure({ code: "INVALID_RESPONSE", status: 200, fields: {} }); return; }
        setMessage("La acción quedó guardada en SQL. El estado de red se muestra por separado.");
        resetDraftOnRead.current = true;
      } else if (intent.kind === "retry") {
        const result = await postOperation(intent.path, intent.body, retryResponseSchema, [200, 202], request.signal);
        if (!alive()) return;
        if (!result.ok) { failure(result.error); if (conflictCodes(result.error.code)) { await load(request.signal); if (alive()) setError(result.error); } return; }
        if (result.data.traceId !== intent.traceId || result.data.eventId !== intent.eventId) { failure({ code: "INVALID_RESPONSE", status: 200, fields: {} }); return; }
        setMessage(retryMessages[result.data.outcome]);
      }
      pending.current = null; setUncertain(false); setConflict(false); setStale(true);
      path.current = traceId ? `/api/demo/runs/${traceId}` : currentPath;
      // A successful POST stands even if the subsequent GET fails. Never replay it for a read failure.
      await load(request.signal);
    } catch {
      if (alive()) { setError({ code: "NETWORK_UNAVAILABLE", status: null, fields: {} }); setUncertain(true); }
    } finally { if (alive()) { lock.current = false; setBusy(false); } }
  }
  function makeIntent(kind: "start" | "reset") {
    if (lock.current || pending.current || conflict) return;
    try {
      void execute({ kind: kind === "start" && !snapshot.current ? "bootstrap" : kind,
        path: kind === "start" && !snapshot.current ? "/api/demo/session" : kind === "reset" ? "/api/demo/runs/reset" : "/api/demo/runs",
        body: kind === "start" && !snapshot.current ? "{}" : JSON.stringify({ requestId: crypto.randomUUID() }) });
    } catch { setError({ code: "INVALID_RESPONSE" }); }
  }
  function command(value: OperationCommand) {
    const run = snapshot.current?.run;
    if (!run || lock.current || pending.current || conflict || stale) return;
    try { void execute({ kind: "command", traceId: run.traceId, action: value.action, expectedVersion: run.version, path: `/api/demo/runs/${run.traceId}/commands`,
      body: JSON.stringify({ ...value, requestId: crypto.randomUUID(), expectedVersion: run.version }) }); }
    catch { setError({ code: "INVALID_RESPONSE" }); }
  }
  function retryPublication(eventId: string) {
    const run = snapshot.current?.run;
    if (!run || lock.current || pending.current || conflict || stale) return;
    try { void execute({ kind: "retry", traceId: run.traceId, eventId, path: `/api/demo/runs/${run.traceId}/events/${eventId}/retry`, body: JSON.stringify({ requestId: crypto.randomUUID() }) }); }
    catch { setError({ code: "INVALID_RESPONSE" }); }
  }
  return { data: deadline !== null && deadline <= Date.now() ? null : data, busy, uncertain, conflict, stale, error,
    errorText: error ? errorMessage(error) : "", message, links: links.filter(link => Date.parse(link.expiresAt) > Date.now()), draftRevision,
    blocked: busy || uncertain || conflict || stale, refresh,
    recoverCurrent: () => { if (!lock.current) { path.current = currentPath; void refresh(); } },
    start: () => makeIntent("start"), reset: () => makeIntent("reset"), command, retryPublication,
    retryIntent: () => { if (pending.current) void execute(pending.current); },
    acknowledgeConflict: () => { if (!lock.current && !stale) { setConflict(false); setError(null); } },
  };
}
function conflictCodes(code: string) { return ["VERSION_CONFLICT", "STATE_CONFLICT", "IDEMPOTENCY_CONFLICT"].includes(code); }

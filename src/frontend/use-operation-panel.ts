"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DemoRunResponse } from "@/shared/run-contracts";
import type { OperationCommand } from "@/shared/operation-contracts";
import type { OperationIntent } from "@/shared/operation-intents";
import { API_ERROR_CATALOG, isApiErrorCode } from "@/shared/api-errors";
import { retryAfterMessage } from "./retry-after";
import { readApi, type ReadError } from "./api";
import { postOperation, type MutationError } from "./operation-api";
import { commandResponseSchema, operationViewSchema, retryResponseSchema, runIntentSchema, sessionResponseSchema } from "./operation-models";

type IntentResolution =
  | { readonly kind: "ready" }
  | { readonly kind: "pending" | "uncertain" | "confirmed"; readonly intent: OperationIntent }
  | { readonly kind: "conflict" };
type PublicLink = { traceId: string; expiresAt: string };
function canCreateIntent(state: IntentResolution) { return state.kind === "ready" || state.kind === "confirmed"; }
const currentPath = "/api/demo/runs/current";
const retryMessages = { ALREADY_CONFIRMED: "El hito ya estaba confirmado en testnet.", BLOCKED: "El envío espera un hito anterior.",
  RECONCILE_ONLY: "Se solicitó comprobar el envío incierto; no se autorizó otro envío.", MANUAL_AUTHORIZED: "El intento adicional quedó autorizado. Esto todavía no confirma el envío.",
  EXHAUSTED: "Se agotaron los intentos de este hito.", AUTOMATIC_PENDING: "Se solicitó procesar el trabajo elegible. La publicación sigue pendiente." };
function errorMessage(error: ReadError | MutationError) {
  return (isApiErrorCode(error.code) ? API_ERROR_CATALOG[error.code].message : "No recibimos una respuesta válida. Revisá la conexión y volvé a intentar.") + retryAfterMessage(error.retryAfter);
}

/** Conservá una sola intención capturada: una lectura no confirma ni reemplaza un POST incierto. */
export function useOperationPanel() {
  const [data, setData] = useState<DemoRunResponse | null>(null);
  const [error, setError] = useState<ReadError | MutationError | null>(null);
  const [message, setMessage] = useState("");
  // Una lectura puede convivir con incertidumbre: no la uses como confirmación de la escritura.
  const [activity, setActivity] = useState<"loading" | "submitting" | "idle">("loading");
  const [resolution, setResolution] = useState<IntentResolution>({ kind: "ready" });
  // Bloqueá eventos consecutivos antes de que React publique el siguiente render.
  const intentState = useRef<IntentResolution>({ kind: "ready" });
  const transition = useCallback((next: IntentResolution) => { intentState.current = next; setResolution(next); }, []);
  const busy = activity !== "idle", uncertain = resolution.kind === "uncertain", conflict = resolution.kind === "conflict";
  const [stale, setStale] = useState(false);
  const [links, setLinks] = useState<PublicLink[]>([]);
  const [draftRevision, setDraftRevision] = useState(0);
  const snapshot = useRef<DemoRunResponse | null>(null);
  const lock = useRef(false), active = useRef(false), generation = useRef(0);
  const controller = useRef<AbortController | null>(null), path = useRef(currentPath);
  const resetDraftOnRead = useRef(false);
  const remember = useCallback((run: PublicLink) => {
    const link = { traceId: run.traceId, expiresAt: run.expiresAt };
    setLinks(previous => [...previous.filter(item => item.traceId !== link.traceId && Date.parse(item.expiresAt) > Date.now()), link]);
  }, []);
  const expire = useCallback(() => {
    generation.current++; controller.current?.abort(); transition({ kind: "ready" }); snapshot.current = null;
    lock.current = false; setActivity("idle"); setData(null); setStale(false);
    setMessage(""); setError({ code: "SESSION_EXPIRED" }); setDraftRevision(value => value + 1);
  }, [transition]);
  const accept = useCallback((value: DemoRunResponse) => {
    const deadline = Math.min(Date.parse(value.session.expiresAt), value.run ? Date.parse(value.run.expiresAt) : Infinity);
    if (deadline <= Date.now()) { expire(); return false; }
    snapshot.current = value; setData(value); setStale(false);
    if (resetDraftOnRead.current) { resetDraftOnRead.current = false; setDraftRevision(revision => revision + 1); }
    if (value.run) remember(value.run);
    return true;
  }, [expire, remember]);
  const load = useCallback(async (signal: AbortSignal) => {
    const result = await readApi(path.current, operationViewSchema, signal);
    if (!active.current || signal.aborted) return false;
    if (result.ok) { if (!accept(result.data)) return false; setError(null); return true; }
    if (["SESSION_REQUIRED", "SESSION_EXPIRED", "NOT_FOUND"].includes(result.error.code)) {
      transition({ kind: "ready" }); snapshot.current = null; setData(null);
      setDraftRevision(value => value + 1);
    }
    setError(result.error); setStale(true); return false;
  }, [accept, transition]);
  async function refresh() {
    if (lock.current) return;
    lock.current = true; setActivity("loading");
    const request = new AbortController(); controller.current = request;
    try { await load(request.signal); }
    finally { if (active.current && !request.signal.aborted) { lock.current = false; setActivity("idle"); } }
  }
  useEffect(() => {
    active.current = true; lock.current = true;
    const request = new AbortController(); controller.current = request;
    void load(request.signal).finally(() => { if (active.current && !request.signal.aborted) { lock.current = false; setActivity("idle"); } });
    return () => { active.current = false; generation.current++; request.abort(); controller.current?.abort(); };
    // Conservá una lectura de montaje: las dependencias estables evitan repetirla al editar.
  }, [load]);
  const deadline = data ? Math.min(Date.parse(data.session.expiresAt), data.run ? Date.parse(data.run.expiresAt) : Infinity) : null;
  useEffect(() => {
    if (deadline === null) return;
    const check = () => { if (Date.now() >= deadline) expire(); };
    const timer = setTimeout(check, Math.min(2147483647, Math.max(0, deadline - Date.now())));
    window.addEventListener("pageshow", check); document.addEventListener("visibilitychange", check);
    return () => { clearTimeout(timer); window.removeEventListener("pageshow", check); document.removeEventListener("visibilitychange", check); };
  }, [deadline, expire]);

  async function execute(intent: OperationIntent) {
    if (lock.current) return;
    if (snapshot.current && Math.min(Date.parse(snapshot.current.session.expiresAt), snapshot.current.run ? Date.parse(snapshot.current.run.expiresAt) : Infinity) <= Date.now()) { expire(); return; }
    lock.current = true; transition({ kind: "pending", intent }); setActivity("submitting"); setError(null); setMessage("");
    let confirmed = false;
    const request = new AbortController(); controller.current = request;
    const epoch = generation.current;
    const alive = () => active.current && !request.signal.aborted && epoch === generation.current;
    function failure(problem: MutationError) {
      if (!alive()) return;
      setError(problem);
      if (problem.code === "RATE_LIMITED" || problem.status === null || problem.code === "INVALID_RESPONSE" || problem.status >= 500) {
        transition({ kind: "uncertain", intent }); return;
      }
      transition({ kind: "ready" });
      if (["SESSION_REQUIRED", "SESSION_EXPIRED", "NOT_FOUND"].includes(problem.code)) {
        snapshot.current = null; setData(null); setStale(true); setDraftRevision(value => value + 1);
      } else if (conflictCodes(problem.code)) transition({ kind: "conflict" });
    }
    try {
      if (intent.kind === "bootstrap") {
        // La cookie puede haber llegado aunque se pierda la respuesta; recuperala antes de crear otra sesión.
        const existing = await readApi("/api/demo/session", sessionResponseSchema, request.signal);
        if (!alive()) return;
        if (!existing.ok && !["SESSION_REQUIRED", "SESSION_EXPIRED"].includes(existing.error.code)) {
          setError(existing.error); transition({ kind: "uncertain", intent }); return;
        }
        if (!existing.ok) {
          const begun = await postOperation(intent.path, intent.body, sessionResponseSchema, [200, 201], request.signal);
          if (!alive()) return;
          if (!begun.ok) { failure(begun.error); return; }
        }
        intent = { kind: "start", path: "/api/demo/runs", body: JSON.stringify({ requestId: crypto.randomUUID() }) };
        transition({ kind: "pending", intent });
      }
      let traceId = intent.kind === "command" || intent.kind === "retry" ? intent.traceId : undefined;
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
        if (result.data.traceId !== intent.traceId || result.data.applied.version !== intent.expectedVersion + 1
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
      confirmed = true; transition({ kind: "confirmed", intent }); setStale(true);
      path.current = traceId ? `/api/demo/runs/${traceId}` : currentPath;
      // El POST confirmado sigue vigente si falla el GET posterior; no vuelvas a enviarlo por ese fallo.
      await load(request.signal);
    } catch {
      if (alive()) {
        setError({ code: "NETWORK_UNAVAILABLE", status: null, fields: {} });
        if (confirmed) setStale(true); else transition({ kind: "uncertain", intent });
      }
    } finally { if (alive()) { lock.current = false; setActivity("idle"); } }
  }
  function makeIntent(kind: "start" | "reset") {
    if (lock.current || !canCreateIntent(intentState.current)) return;
    try {
      if (kind === "start" && !snapshot.current) void execute({ kind: "bootstrap", path: "/api/demo/session", body: "{}" });
      else if (kind === "reset") void execute({ kind: "reset", path: "/api/demo/runs/reset", body: JSON.stringify({ requestId: crypto.randomUUID() }) });
      else void execute({ kind: "start", path: "/api/demo/runs", body: JSON.stringify({ requestId: crypto.randomUUID() }) });
    } catch { setError({ code: "INVALID_RESPONSE" }); }
  }
  function command(value: OperationCommand) {
    const run = snapshot.current?.run;
    if (!run || lock.current || !canCreateIntent(intentState.current) || stale) return;
    try { void execute({ kind: "command", traceId: run.traceId, action: value.action, expectedVersion: run.version, path: `/api/demo/runs/${run.traceId}/commands`,
      body: JSON.stringify({ ...value, requestId: crypto.randomUUID(), expectedVersion: run.version }) }); }
    catch { setError({ code: "INVALID_RESPONSE" }); }
  }
  function retryPublication(eventId: string) {
    const run = snapshot.current?.run;
    if (!run || lock.current || !canCreateIntent(intentState.current) || stale) return;
    try { void execute({ kind: "retry", traceId: run.traceId, eventId, path: `/api/demo/runs/${run.traceId}/events/${eventId}/retry`, body: JSON.stringify({ requestId: crypto.randomUUID() }) }); }
    catch { setError({ code: "INVALID_RESPONSE" }); }
  }
  return { data: deadline !== null && deadline <= Date.now() ? null : data, busy, uncertain, conflict, stale, error,
    errorText: error ? errorMessage(error) : "", message, links: links.filter(link => Date.parse(link.expiresAt) > Date.now()), draftRevision,
    blocked: busy || uncertain || conflict || stale, refresh,
    recoverCurrent: () => { if (!lock.current) { path.current = currentPath; void refresh(); } },
    start: () => makeIntent("start"), reset: () => makeIntent("reset"), command, retryPublication,
    retryIntent: () => { const current = intentState.current; if (current.kind === "uncertain") void execute(current.intent); },
    acknowledgeConflict: () => { if (!lock.current && !stale && intentState.current.kind === "conflict") { transition({ kind: "ready" }); setError(null); } },
  };
}
function conflictCodes(code: string) { return ["VERSION_CONFLICT", "STATE_CONFLICT", "IDEMPOTENCY_CONFLICT"].includes(code); }

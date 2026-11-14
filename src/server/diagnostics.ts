import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import packageInfo from "../../package.json" with { type: "json" };
import { API_ERROR_CATALOG, isApiErrorCode } from "../shared/api-errors";
import { HCS_CODES, type HcsCode } from "./hedera/contracts";

export const HTTP_OPERATIONS = {
  "session.read": ["GET", "/api/demo/session"], "session.create": ["POST", "/api/demo/session"],
  "session.delete": ["DELETE", "/api/demo/session"],
  "runs.start": ["POST", "/api/demo/runs"], "runs.reset": ["POST", "/api/demo/runs/reset"],
  "runs.current": ["GET", "/api/demo/runs/current"], "runs.read": ["GET", "/api/demo/runs/:traceId"],
  "runs.operation.read": ["GET", "/api/demo/runs/:traceId/operation"],
  "runs.operation.patch": ["PATCH", "/api/demo/runs/:traceId/operation"],
  "runs.command": ["POST", "/api/demo/runs/:traceId/commands"],
  "traces.read": ["GET", "/api/traces/:traceId"], "traces.verify": ["GET", "/api/traces/:traceId/events/:eventId/verification"],
  "traces.v1.read": ["GET", "/api/v1/traces/:traceId"], "traces.v1.verify": ["GET", "/api/v1/traces/:traceId/events/:eventId/verification"],
  "publications.retry": ["POST", "/api/demo/runs/:traceId/events/:eventId/retry"],
  "contacts.create": ["POST", "/api/demo-requests"], "maintenance.run": ["GET", "/api/cron"],
} as const;
export type HttpOperation = keyof typeof HTTP_OPERATIONS;
type Operation = HttpOperation | "database.transaction" | "database.query" | "publications.drain" | "database.pool" | "provider.call";
type Event = "http.completed" | "dependency.completed" | "operation.committed" | "background.completed" | "maintenance.completed" | "database.connection" | "publication.recovered";
type Outcome = "success" | "rejected" | "error" | "partial" | "skipped";
const customCodes = ["OK", "OPERATION_COMMITTED", "PUBLICATION_WORK_PENDING", "PUBLICATION_WORK_NOT_SCHEDULED", "DATABASE_POOL_ERROR", "DATABASE_CONNECTION_ERROR", "MAINTENANCE_COMPLETE", "MAINTENANCE_PARTIAL", "MAINTENANCE_SKIPPED", "MAINTENANCE_CATEGORY_FAILED"] as const;
type Code = keyof typeof API_ERROR_CATALOG | HcsCode | typeof customCodes[number];
function isHcsCode(value: string): value is HcsCode { return HCS_CODES.some(known => known === value); }
function isCode(value: string): value is Code { return isApiErrorCode(value) || isHcsCode(value) || customCodes.some(known => known === value); }

export interface DiagnosticLink {
  readonly traceId: string;
  readonly spanId: string;
}

export interface ParsedTraceparent {
  readonly version: string;
  readonly traceId: string;
  readonly parentId: string;
  readonly flags: string;
}

export function parseTraceparent(raw: string | null | undefined): ParsedTraceparent | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length < 55) return null;
  const parts = trimmed.split("-");
  if (parts.length < 4) return null;
  const [version, traceId, parentId, flags] = parts;
  if (!version || !traceId || !parentId || !flags) return null;
  if (!/^[0-9a-f]{2}$/i.test(version) || version.toLowerCase() === "ff") return null;
  if (version === "00" && (parts.length !== 4 || trimmed.length !== 55)) return null;
  if (!/^[0-9a-f]{32}$/i.test(traceId) || /^0{32}$/.test(traceId)) return null;
  if (!/^[0-9a-f]{16}$/i.test(parentId) || /^0{16}$/.test(parentId)) return null;
  if (!/^[0-9a-f]{2}$/i.test(flags)) return null;
  return {
    version: version.toLowerCase(),
    traceId: traceId.toLowerCase(),
    parentId: parentId.toLowerCase(),
    flags: flags.toLowerCase(),
  };
}

export function parseTracestate(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 512) return null;
  const entries = trimmed.split(",").map(e => e.trim()).filter(Boolean);
  if (entries.length === 0 || entries.length > 32) return null;
  for (const entry of entries) {
    const eq = entry.indexOf("=");
    if (eq <= 0 || eq === entry.length - 1) return null;
    const key = entry.slice(0, eq).trim();
    const value = entry.slice(eq + 1).trim();
    if (!/^[a-z0-9_\-*/]{1,256}(?:@[a-z0-9_\-*/]{1,241})?$/.test(key)) return null;
    if (!/^[\x21-\x2b\x2d-\x3c\x3e-\x7e]{1,256}$/.test(value)) return null;
  }
  return trimmed;
}

export function parseBaggage(raw: string | null | undefined): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  if (typeof raw !== "string") return result;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || Buffer.byteLength(trimmed) > 4096) return result;
  const items = trimmed.split(",");
  if (items.length > 64) return result;
  for (const item of items) {
    const pair = item.split(";")[0]?.trim();
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (/^[a-zA-Z0-9!#$%&'*+\-.^_`|~]+$/.test(key) && key.length <= 128 && value.length <= 256) {
      result.set(key, value);
    }
  }
  return result;
}

export interface RequestContextOptions {
  readonly budgetMs?: number;
  readonly clientSignal?: AbortSignal;
  readonly headers?: Headers | Record<string, string | string[] | undefined> | null;
  readonly trustW3c?: boolean;
}

function extractHeader(headers: Headers | Record<string, string | string[] | undefined> | null | undefined, name: string): string | null {
  if (!headers) return null;
  if (typeof (headers as unknown as { get?: unknown }).get === "function") {
    return (headers as unknown as { get(headerName: string): string | null }).get(name);
  }
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      if (Array.isArray(value)) return value[0] ?? null;
      return typeof value === "string" ? value : null;
    }
  }
  return null;
}

export interface RequestContext {
  readonly requestId: string; readonly telemetryTraceId: string; readonly spanId: string; readonly parentSpanId: string | null;
  readonly operation: Operation; readonly method: string; readonly route: string;
  readonly startedAt: number; readonly deadlineAt: number; readonly clientSignal?: AbortSignal; readonly links?: readonly DiagnosticLink[]; businessTraceId: string | undefined;
}
const storage = new AsyncLocalStorage<RequestContext>();
export function createRequestContext(operation: HttpOperation = "session.read", options?: RequestContextOptions): RequestContext {
  const [method, route] = HTTP_OPERATIONS[operation], startedAt = performance.now();
  const rawParent = extractHeader(options?.headers, "traceparent");
  const rawState = extractHeader(options?.headers, "tracestate");
  const rawBaggage = extractHeader(options?.headers, "baggage");
  const parsedParent = parseTraceparent(rawParent);
  if (rawState) parseTracestate(rawState);
  if (rawBaggage) parseBaggage(rawBaggage);

  const trust = options?.trustW3c === true;
  let telemetryTraceId: string;
  const spanId = randomBytes(8).toString("hex");
  let parentSpanId: string | null = null;
  let links: readonly DiagnosticLink[] | undefined = undefined;

  if (trust && parsedParent) {
    telemetryTraceId = parsedParent.traceId;
    parentSpanId = parsedParent.parentId;
  } else {
    telemetryTraceId = randomBytes(16).toString("hex");
    parentSpanId = null;
    if (parsedParent) {
      links = [{ traceId: parsedParent.traceId, spanId: parsedParent.parentId }];
    }
  }

  return { requestId: randomUUID(), telemetryTraceId, spanId, parentSpanId,
    operation, method, route, startedAt, deadlineAt: startedAt + (options?.budgetMs ?? 10_000), ...(options?.clientSignal ? { clientSignal: options.clientSignal } : {}), ...(links ? { links } : {}), businessTraceId: undefined };
}
export const currentRequestContext = () => storage.getStore();
export const withRequestContext = <T>(context: RequestContext, work: () => T): T => storage.run(context, work);
export const withoutRequestContext = <T>(work: () => T): T => storage.exit(work);
export const shouldLogHttp = (status: number, requestId: string): boolean => status < 400 || status >= 500 || requestId.endsWith("0");
export function childContext(parent: RequestContext, operation: Operation, options?: { links?: readonly DiagnosticLink[] }): RequestContext {
  const spanId = randomBytes(8).toString("hex");
  const links = options?.links ?? parent.links;
  if (operation === "publications.drain") {
    const startedAt = performance.now(), { clientSignal: _ignored, ...rest } = parent;
    return { ...rest, operation, spanId, parentSpanId: parent.spanId, startedAt, deadlineAt: startedAt + 45_000, ...(links && links.length > 0 ? { links } : {}) };
  }
  return { ...parent, operation, spanId, parentSpanId: parent.spanId, ...(links && links.length > 0 ? { links } : {}) };
}
export function bindBusinessTraceId(value: string): void {
  const context = storage.getStore();
  if (context && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value)) context.businessTraceId = value;
}
function field(value: unknown, key: string): unknown {
  try { return value !== null && typeof value === "object" && Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined; } catch { return undefined; }
}
const errorTypes = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "ApplicationError", "HcsError", "PrismaClientKnownRequestError", "PrismaClientUnknownRequestError", "PrismaClientInitializationError", "DriverAdapterError"]);
const providerCodes = new Set(["23503", "23505", "23514", "40001", "40P01", "42501", "53300", "57014", "57P01", "P0001", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EPIPE", "P1000", "P1001", "P1002", "P1008", "P1010", "P1011", "P1017", "P2002", "P2004", "P2010", "P2024", "P2028", "P2034", "P2037"]);
const sourceFiles = ["http", "api-errors", "database/index", "database/client", "database/errors", "operations/commands", "operations/storage-core", "events/payload-core", "hedera/sdk", "hedera/mirror", "hedera/coordinator", "traces/queries", "security/rate-limit", "security/visitor-identity", "sessions/service", "contacts/service"];

/** Conservá tipo, código conocido y ubicación propia; nunca mensajes, SQL, meta cruda ni stack completo. */
export function safeErrorChain(error: unknown) {
  if (error === null || typeof error !== "object") return [{ type: "NonErrorThrown", code: null, frames: [] }];
  const queue: unknown[] = [error], seen = new Set<object>();
  const chain: { type: string; code: string | null; frames: string[] }[] = [];
  for (let visited = 0; queue.length && visited < 16 && chain.length < 6; visited++) {
    const item = queue.shift();
    if (item === null || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);
    const name = field(item, "name"), code = field(item, "code") ?? field(item, "originalCode");
    const type = typeof name === "string" && errorTypes.has(name) ? name : item instanceof TypeError ? "TypeError" : item instanceof Error ? "Error" : "ProviderError";
    const allowedCode = typeof code === "string" && (isApiErrorCode(code) || HCS_CODES.some(known => known === code) || providerCodes.has(code)) ? code : null;
    const frames: string[] = [];
    const stack = field(item, "stack");
    if (typeof stack === "string") for (const line of stack.slice(0, 16000).split("\n").slice(1, 18)) {
      for (const file of sourceFiles) {
        const location = `src/server/${file}.ts`, at = line.replaceAll("\\", "/").indexOf(location);
        if (at < 0) continue;
        const position = line.replaceAll("\\", "/").slice(at + location.length).match(/^:(\d{1,6}):(\d{1,6})/);
        if (position) frames.push(`${location}:${position[1]}:${position[2]}`);
      }
      if (frames.length >= 4) break;
    }
    chain.push({ type, code: allowedCode, frames: frames.slice(0, 4) });
    for (const key of ["cause", "meta", "driverAdapterError"]) queue.push(field(item, key));
  }
  return chain;
}
export function diagnosticCode(error: unknown): Code {
  const code = field(error, "code");
  return typeof code === "string" && (isApiErrorCode(code) || isHcsCode(code)) ? code : "INTERNAL_ERROR";
}
interface Diagnostic {
  readonly event: Event; readonly outcome: Outcome; readonly code: Code; readonly durationMs: number;
  readonly severity?: "INFO" | "WARN" | "ERROR"; readonly status?: number; readonly error?: unknown;
  readonly counts?: Readonly<Record<string, number>>; readonly pending?: Readonly<Record<string, number>>;
  readonly oldestExpiredAgeMs?: number; readonly withinRetentionTarget?: boolean; readonly stalledCategories?: readonly string[];
  readonly lastCompletedAt?: string | null; readonly lastPartialAt?: string | null;
  readonly links?: readonly DiagnosticLink[];
}
function safeCounts(source: Readonly<Record<string, number>> | undefined) {
  const counts: Record<string, number> = {};
  for (const key of ["runs", "contacts", "sessions", "quotas", "leases", "rateBuckets", "processed", "dropped"]) {
    const value = source?.[key];
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) counts[key] = value;
  }
  return counts;
}
let blocked = false;
let exporterInitialized = false;
let droppedDiagnostics = 0;
export function getDroppedDiagnosticsCount(): number { return droppedDiagnostics; }
export function resetDiagnosticsExporterForTests(): void { blocked = false; droppedDiagnostics = 0; }
/** La salida es el exportador: una línea acotada y sin cola propia; ante backpressure descartá, no bloquees negocio. */
export function logDiagnostic(input: Diagnostic): void {
  try {
    // Incluso abrir stderr puede fallar si el colector cerró el pipe antes de iniciar el proceso.
    const output = process.stderr;
    if (blocked || output.destroyed || !output.writable) {
      droppedDiagnostics++;
      return;
    }
    if (!exporterInitialized) {
      if (output.listenerCount("error") === 0) output.on("error", () => { blocked = true; });
      exporterInitialized = true;
    }
    const context = storage.getStore(), counts = safeCounts(input.counts);
    const candidateLinks = input.links ?? context?.links;
    const links = candidateLinks?.filter(
      (l): l is DiagnosticLink => Boolean(l && typeof l.traceId === "string" && /^[a-f0-9]{32}$/.test(l.traceId)
        && typeof l.spanId === "string" && /^[a-f0-9]{16}$/.test(l.spanId))
    );
    const line = JSON.stringify({ timestamp: new Date().toISOString(), severity: input.severity === "ERROR" ? "ERROR" : input.severity === "WARN" ? "WARN" : "INFO",
      "service.name": "jopoi", "service.version": packageInfo.version,
      environment: process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV === "test" ? "test" : "development",
      "event.name": ["http.completed", "dependency.completed", "operation.committed", "background.completed", "maintenance.completed", "database.connection", "publication.recovered"].includes(input.event) ? input.event : "http.completed", requestId: context?.requestId ?? null, traceId: context?.telemetryTraceId ?? null,
      spanId: context?.spanId ?? null, parentSpanId: context?.parentSpanId ?? null, businessTraceId: context?.businessTraceId ?? null,
      ...(links && links.length > 0 ? { links: links.slice(0, 8).map(l => ({ traceId: l.traceId, spanId: l.spanId })) } : {}),
      operation: context?.operation ?? "database.pool", method: context?.method ?? null, route: context?.route ?? null,
      code: isCode(input.code) ? input.code : "INTERNAL_ERROR", outcome: ["success", "rejected", "error", "partial", "skipped"].includes(input.outcome) ? input.outcome : "error", durationMs: Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs)) : 0,
      ...(input.status === undefined || !Number.isInteger(input.status) || input.status < 100 || input.status > 599 ? {} : { status: input.status }),
      ...(Object.hasOwn(input, "error") ? { error: safeErrorChain(input.error) } : {}), counts,
      ...(input.pending === undefined ? {} : { pending: safeCounts(input.pending) }),
      ...(typeof input.oldestExpiredAgeMs === "number" && Number.isFinite(input.oldestExpiredAgeMs) ? { oldestExpiredAgeMs: Math.max(0, Math.round(input.oldestExpiredAgeMs)) } : {}),
      ...(typeof input.withinRetentionTarget === "boolean" ? { withinRetentionTarget: input.withinRetentionTarget } : {}),
      ...(Array.isArray(input.stalledCategories) ? { stalledCategories: input.stalledCategories.filter((c): c is string => typeof c === "string") } : {}),
      ...(input.lastCompletedAt !== undefined ? { lastCompletedAt: input.lastCompletedAt } : {}),
      ...(input.lastPartialAt !== undefined ? { lastPartialAt: input.lastPartialAt } : {}) });
    if (Buffer.byteLength(line) > 8192) {
      droppedDiagnostics++;
      return;
    }
    if (!output.write(line + "\n", error => { if (error) blocked = true; })) {
      blocked = true;
      output.once("drain", () => { blocked = false; });
    }
  } catch { /* La exportación nunca reemplaza el resultado de negocio. */ }
}
export async function measureDependency<T>(operation: "database.transaction" | "database.query" | "provider.call", work: () => Promise<T>): Promise<T> {
  const parent = storage.getStore();
  if (!parent) return work(); // El CLI conserva su salida funcional y no inventa una solicitud HTTP.
  const context = childContext(parent, operation), started = performance.now();
  return storage.run(context, async () => {
    try { const result = await work(); logDiagnostic({ event: "dependency.completed", outcome: "success", code: "OK", durationMs: performance.now() - started }); return result; }
    catch (error) { logDiagnostic({ event: "dependency.completed", outcome: "error", code: diagnosticCode(error), durationMs: performance.now() - started }); throw error; }
  });
}

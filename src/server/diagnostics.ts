import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import packageInfo from "../../package.json" with { type: "json" };
import { API_ERROR_CATALOG, isApiErrorCode } from "../shared/api-errors";
import { HCS_CODES, type HcsCode } from "./hedera/contracts";

export const HTTP_OPERATIONS = {
  "session.read": ["GET", "/api/demo/session"], "session.create": ["POST", "/api/demo/session"],
  "runs.start": ["POST", "/api/demo/runs"], "runs.reset": ["POST", "/api/demo/runs/reset"],
  "runs.current": ["GET", "/api/demo/runs/current"], "runs.read": ["GET", "/api/demo/runs/:traceId"],
  "runs.command": ["POST", "/api/demo/runs/:traceId/commands"],
  "traces.read": ["GET", "/api/traces/:traceId"], "traces.verify": ["GET", "/api/traces/:traceId/events/:eventId/verification"],
  "publications.retry": ["POST", "/api/demo/runs/:traceId/events/:eventId/retry"],
  "contacts.create": ["POST", "/api/demo-requests"], "maintenance.run": ["GET", "/api/cron"],
} as const;
export type HttpOperation = keyof typeof HTTP_OPERATIONS;
type Operation = HttpOperation | "database.transaction" | "database.query" | "publications.drain" | "database.pool";
type Event = "http.completed" | "dependency.completed" | "operation.committed" | "background.completed" | "maintenance.completed" | "database.connection" | "publication.recovered";
type Outcome = "success" | "rejected" | "error" | "partial" | "skipped";
const customCodes = ["OK", "OPERATION_COMMITTED", "PUBLICATION_WORK_PENDING", "PUBLICATION_WORK_NOT_SCHEDULED", "DATABASE_POOL_ERROR", "DATABASE_CONNECTION_ERROR", "MAINTENANCE_COMPLETE", "MAINTENANCE_PARTIAL", "MAINTENANCE_SKIPPED"] as const;
type Code = keyof typeof API_ERROR_CATALOG | HcsCode | typeof customCodes[number];
function isHcsCode(value: string): value is HcsCode { return HCS_CODES.some(known => known === value); }
function isCode(value: string): value is Code { return isApiErrorCode(value) || isHcsCode(value) || customCodes.some(known => known === value); }

export interface RequestContext {
  readonly requestId: string;
  readonly telemetryTraceId: string;
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly operation: Operation;
  readonly method: string;
  readonly route: string;
  businessTraceId: string | undefined;
}
const storage = new AsyncLocalStorage<RequestContext>();
export function createRequestContext(operation: HttpOperation = "session.read"): RequestContext {
  const [method, route] = HTTP_OPERATIONS[operation];
  // El visitante no decide la referencia interna ni aporta baggage al contexto privado.
  return { requestId: randomUUID(), telemetryTraceId: randomBytes(16).toString("hex"), spanId: randomBytes(8).toString("hex"), parentSpanId: null, operation, method, route, businessTraceId: undefined };
}
export const currentRequestContext = () => storage.getStore();
export const withRequestContext = <T>(context: RequestContext, work: () => T): T => storage.run(context, work);
export const withoutRequestContext = <T>(work: () => T): T => storage.exit(work);
export const shouldLogHttp = (status: number, requestId: string): boolean => status < 400 || status >= 500 || requestId.endsWith("0");
export function childContext(parent: RequestContext, operation: Operation): RequestContext {
  return { ...parent, operation, spanId: randomBytes(8).toString("hex"), parentSpanId: parent.spanId };
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
const sourceFiles = ["http", "api-errors", "database/index", "database/client", "database/errors", "operations/commands", "operations/storage-core", "events/payload-core", "hedera/sdk", "hedera/mirror", "hedera/coordinator", "traces/queries"];

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
  readonly event: Event;
  readonly outcome: Outcome;
  readonly code: Code;
  readonly durationMs: number;
  readonly severity?: "INFO" | "WARN" | "ERROR";
  readonly status?: number;
  readonly error?: unknown;
  readonly counts?: Readonly<Record<string, number>>;
}
let blocked = false;
let exporterInitialized = false;
/** La salida es el exportador: una línea acotada y sin cola propia; ante backpressure descartá, no bloquees negocio. */
export function logDiagnostic(input: Diagnostic): void {
  try {
    // Incluso abrir stderr puede fallar si el colector cerró el pipe antes de iniciar el proceso.
    const output = process.stderr;
    if (blocked || output.destroyed || !output.writable) return;
    if (!exporterInitialized) {
      if (output.listenerCount("error") === 0) output.on("error", () => { blocked = true; });
      exporterInitialized = true;
    }
    const context = storage.getStore();
    const counts: Record<string, number> = {};
    for (const key of ["runs", "contacts", "sessions", "quotas", "leases", "rateBuckets", "processed"]) {
      const value = input.counts?.[key];
      if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) counts[key] = value;
    }
    const line = JSON.stringify({ timestamp: new Date().toISOString(), severity: input.severity === "ERROR" ? "ERROR" : input.severity === "WARN" ? "WARN" : "INFO",
      "service.name": "jopoi", "service.version": packageInfo.version,
      environment: process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV === "test" ? "test" : "development",
      "event.name": ["http.completed", "dependency.completed", "operation.committed", "background.completed", "maintenance.completed", "database.connection", "publication.recovered"].includes(input.event) ? input.event : "http.completed", requestId: context?.requestId ?? null, traceId: context?.telemetryTraceId ?? null,
      spanId: context?.spanId ?? null, parentSpanId: context?.parentSpanId ?? null, businessTraceId: context?.businessTraceId ?? null,
      operation: context?.operation ?? "database.pool", method: context?.method ?? null, route: context?.route ?? null,
      code: isCode(input.code) ? input.code : "INTERNAL_ERROR", outcome: ["success", "rejected", "error", "partial", "skipped"].includes(input.outcome) ? input.outcome : "error", durationMs: Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs)) : 0,
      ...(input.status === undefined || !Number.isInteger(input.status) || input.status < 100 || input.status > 599 ? {} : { status: input.status }),
      ...(Object.hasOwn(input, "error") ? { error: safeErrorChain(input.error) } : {}), counts });
    if (Buffer.byteLength(line) > 8192) return;
    if (!output.write(line + "\n", error => { if (error) blocked = true; })) {
      blocked = true;
      output.once("drain", () => { blocked = false; });
    }
  } catch { /* La exportación nunca reemplaza el resultado de negocio. */ }
}
export async function measureDependency<T>(operation: "database.transaction" | "database.query", work: () => Promise<T>): Promise<T> {
  const parent = storage.getStore();
  if (!parent) return work(); // El CLI conserva su salida funcional y no inventa una solicitud HTTP.
  const context = childContext(parent, operation), started = performance.now();
  return storage.run(context, async () => {
    try { const result = await work(); logDiagnostic({ event: "dependency.completed", outcome: "success", code: "OK", durationMs: performance.now() - started }); return result; }
    catch (error) { logDiagnostic({ event: "dependency.completed", outcome: "error", code: diagnosticCode(error), durationMs: performance.now() - started }); throw error; }
  });
}

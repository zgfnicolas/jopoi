import { ApplicationError } from "../application-error";

const UNAVAILABLE_CODES = new Set([
  "P1000", "P1001", "P1002", "P1003", "P1008", "P1010", "P1011", "P1017", "P2024", "P2037",
  "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "EPIPE", "ENETUNREACH",
  "28P01", "28000", "3D000", "53300", "57P01", "57P02", "57P03", "57014",
]);

const UNAVAILABLE_KINDS = new Set([
  "DatabaseNotReachable", "DatabaseDoesNotExist", "DatabaseAccessDenied", "ConnectionClosed",
  "TlsConnectionError", "AuthenticationFailed", "TooManyConnections", "SocketTimeout",
]);

/** Clasifica sin publicar ni registrar conexiones, consultas o mensajes del proveedor. */
export function mapDatabaseError(error: unknown): unknown {
  if (error instanceof ApplicationError) return error;
  const pending: unknown[] = [error];
  const visited = new Set<object>();
  for (let depth = 0; depth < 16 && pending.length > 0; depth++) {
    const current = pending.pop();
    if (current === null || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    const code = "code" in current && typeof current.code === "string" ? current.code
      : "originalCode" in current && typeof current.originalCode === "string" ? current.originalCode : "";
    const kind = "kind" in current && typeof current.kind === "string" ? current.kind : "";
    if (["P2034", "40001", "40P01"].includes(code) || kind === "TransactionWriteConflict") {
      return new ApplicationError("VERSION_CONFLICT", undefined, { cause: error });
    }
    if (UNAVAILABLE_CODES.has(code) || code.startsWith("08") || UNAVAILABLE_KINDS.has(kind)) {
      return new ApplicationError("DATABASE_UNAVAILABLE", undefined, { cause: error });
    }
    const message = "message" in current && typeof current.message === "string" ? current.message : "";
    if (/timeout exceeded when trying to connect|connection terminated unexpectedly|connection timeout|query read timeout|expired transaction/i.test(message)) {
      return new ApplicationError("DATABASE_UNAVAILABLE", undefined, { cause: error });
    }
    if ("cause" in current) pending.push(current.cause);
    if ("meta" in current) pending.push(current.meta);
    if ("driverAdapterError" in current) pending.push(current.driverAdapterError);
  }
  // Unicidad y restricciones quedan disponibles para que el servicio las interprete.
  return error;
}

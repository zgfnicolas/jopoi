import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { databaseConnection } from "./connection-policy";
import { logDiagnostic, withoutRequestContext } from "../diagnostics";

/** Sin entorno global ni conexión durante importación; reutilizable por CLI. */
export function createDatabaseClient(url: string): PrismaClient {
  const adapter = new PrismaPg({
    ...databaseConnection(url),
    max: 2,
    min: 0,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    statement_timeout: 5000,
    query_timeout: 5500,
    allowExitOnIdle: true,
  }, {
    onPoolError: () => withoutRequestContext(() => logDiagnostic({ event: "database.connection", code: "DATABASE_POOL_ERROR", severity: "WARN", outcome: "error", durationMs: 0 })),
    // La excepción y su causa se registran una vez al terminar la solicitud que falló.
    onConnectionError: () => withoutRequestContext(() => logDiagnostic({ event: "database.connection", code: "DATABASE_CONNECTION_ERROR", outcome: "error", durationMs: 0 })),
  });
  return new PrismaClient({ adapter, log: [], errorFormat: "minimal" });
}

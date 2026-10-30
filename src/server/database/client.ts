import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { databaseConnection } from "./connection-policy";

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
    onPoolError: () => console.error("DATABASE_POOL_ERROR"),
    onConnectionError: () => console.error("DATABASE_CONNECTION_ERROR"),
  });
  return new PrismaClient({ adapter, log: [], errorFormat: "minimal" });
}

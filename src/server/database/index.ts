import "server-only";
import { measureDependency } from "../diagnostics";

import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { ApplicationError } from "../application-error";
import { getServerConfig, requireConfiguration } from "../config";
import { createDatabaseClient } from "./client";
import { mapDatabaseError } from "./errors";

let database: PrismaClient | undefined;
const developmentGlobal = globalThis as typeof globalThis & { jopoiDatabase?: PrismaClient };

export function getDatabase(): PrismaClient {
  if (database !== undefined) return database;
  if (process.env.NODE_ENV !== "production" && developmentGlobal.jopoiDatabase !== undefined) {
    database = developmentGlobal.jopoiDatabase;
    return database;
  }
  const config = requireConfiguration(getServerConfig().database());
  database = createDatabaseClient(config.url);
  if (process.env.NODE_ENV !== "production") developmentGlobal.jopoiDatabase = database;
  return database;
}

/** Lecturas u operaciones SQL independientes con traducción de errores de dependencia. */
export async function withDatabase<T>(work: (db: PrismaClient) => Promise<T>): Promise<T> {
  return measureDependency("database.query", async () => {
    try { return await work(getDatabase()); } catch (error) { throw mapDatabaseError(error); }
  });
}

/** Solo SQL: no llamar Hedera ni otras fronteras externas dentro del callback. */
export async function withTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return measureDependency("database.transaction", async () => {
  try {
    return await getDatabase().$transaction(work, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 2000,
      timeout: 5000,
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
  });
}

/** El servicio debe autorizar propietario/vigencia dentro de la misma transacción antes de usarlo. */
export async function advanceRunVersion(
  tx: Prisma.TransactionClient,
  runId: string,
  expectedVersion: number,
): Promise<number> {
  const result = await tx.demoRun.updateMany({
    where: { id: runId, version: expectedVersion },
    data: { version: { increment: 1 } },
  });
  if (result.count !== 1) throw new ApplicationError("VERSION_CONFLICT");
  return expectedVersion + 1;
}

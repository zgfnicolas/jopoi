import "server-only";
import { performance } from "node:perf_hooks";
import { getDeadlinePolicy } from "@/server/runtime/deadlines";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { ApplicationError } from "../application-error";
import { getServerConfig, requireConfiguration } from "../config";
import { raceWithReadAbort, sqlStepBudget } from "../deadlines";
import { currentRequestContext, measureDependency } from "../diagnostics";
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

/** Lecturas u operaciones SQL independientes con presupuesto de deadline y cancelación de lecturas. */
export async function withDatabase<T>(work: (db: PrismaClient) => Promise<T>): Promise<T> {
  return measureDependency("database.query", async () => {
    const context = currentRequestContext();
    const policy = getDeadlinePolicy();
    try {
      if (context?.clientSignal?.aborted) throw new ApplicationError("DATABASE_UNAVAILABLE");
      sqlStepBudget(policy, context ? context.deadlineAt - performance.now() : undefined);
      return await raceWithReadAbort(() => work(getDatabase()), context?.clientSignal);
    } catch (error) {
      throw mapDatabaseError(error);
    }
  });
}

/** Solo SQL: no llamar Hedera ni otras fronteras externas dentro del callback. */
export async function withTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return measureDependency("database.transaction", async () => {
    const context = currentRequestContext();
    const policy = getDeadlinePolicy();
    try {
      if (context?.clientSignal?.aborted) throw new ApplicationError("DATABASE_UNAVAILABLE");
      const { maxWait, timeout } = sqlStepBudget(policy, context ? context.deadlineAt - performance.now() : undefined);
      return await raceWithReadAbort(
        () =>
          getDatabase().$transaction(work, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait,
            timeout,
          }),
        context?.clientSignal,
      );
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

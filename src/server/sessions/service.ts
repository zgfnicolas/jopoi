import { now as wallNow } from "@/server/runtime/clock";
import "server-only";

import { Prisma, type DemoRun, type DemoSession, type SessionIntentKind } from "../../generated/prisma/client";
import { createScenarioSnapshot } from "../../domain/scenario";
import { DEMO_POLICY } from "../../shared/demo-policy";
import type { DemoRunIntentResponse, DemoRunSummary, DemoSessionResponse, DemoSessionSummary } from "../../shared/session-contracts";
import { ApplicationError } from "../application-error";
import { withTransaction } from "../database";
import { toStoredGrams, toStoredHumidity } from "../database/precision";
import { newSessionToken, sessionTokenHash } from "./credentials";

type Transaction = Prisma.TransactionClient;
type RunSummaryRow = Pick<DemoRun, "traceId" | "state" | "version" | "expiresAt">;

const summarySelect = { id: true, traceId: true, state: true, version: true, expiresAt: true } as const;

export function sessionSummary(session: DemoSession): DemoSessionSummary {
  return {
    expiresAt: session.expiresAt.toISOString(),
    runCount: session.runCount,
    remainingRuns: DEMO_POLICY.maxRunsPerSession - session.runCount,
  };
}

function runSummary(run: RunSummaryRow): DemoRunSummary {
  return { traceId: run.traceId, state: run.state, version: run.version, expiresAt: run.expiresAt.toISOString() };
}

async function activeRun(tx: Transaction, sessionId: string) {
  return tx.demoRun.findFirst({
    where: { sessionId, expiresAt: { gt: wallNow() } },
    orderBy: { ordinal: "desc" },
    select: summarySelect,
  });
}

async function sessionResponse(tx: Transaction, session: DemoSession): Promise<DemoSessionResponse> {
  const run = await activeRun(tx, session.id);
  return { session: sessionSummary(session), activeRun: run === null ? null : runSummary(run) };
}

/** Llamar dentro de la misma transacción que la consulta o mutación privada. */
export async function requireSession(tx: Transaction, tokenHash: string | undefined): Promise<DemoSession> {
  if (tokenHash === undefined) throw new ApplicationError("SESSION_REQUIRED");
  const session = await tx.demoSession.findUnique({ where: { tokenHash } });
  if (session === null) throw new ApplicationError("SESSION_REQUIRED");
  if (session.expiresAt.getTime() <= wallNow().getTime()) throw new ApplicationError("SESSION_EXPIRED");
  return session;
}

/** No autoriza por traceId: filtra siempre por propietario y vigencia. */
export async function requireOwnedRun(tx: Transaction, tokenHash: string | undefined, traceId: string) {
  const session = await requireSession(tx, tokenHash);
  const run = await tx.demoRun.findFirst({
    where: { traceId, sessionId: session.id, expiresAt: { gt: wallNow() } },
  });
  if (run === null) throw new ApplicationError("NOT_FOUND");
  return { session, run };
}

export async function recoverSession(token: string | undefined): Promise<DemoSessionResponse> {
  const hash = sessionTokenHash(token);
  return withTransaction(async (tx) => sessionResponse(tx, await requireSession(tx, hash)));
}

/** Solo invocada por el inicio explícito de sesión, nunca como fallback de comandos. */
export async function beginSession(token: string | undefined) {
  const hash = sessionTokenHash(token);
  return withTransaction(async (tx) => {
    const existing = hash === undefined ? null : await tx.demoSession.findUnique({ where: { tokenHash: hash } });
    if (existing !== null && existing.expiresAt.getTime() > wallNow().getTime()) {
      return { body: await sessionResponse(tx, existing), token: undefined, created: false };
    }
    const freshToken = newSessionToken();
    const freshHash = sessionTokenHash(freshToken);
    if (freshHash === undefined) throw new ApplicationError("INTERNAL_ERROR");
    const now = wallNow();
    const session = await tx.demoSession.create({
      data: {
        tokenHash: freshHash,
        createdAt: now,
        expiresAt: new Date(now.getTime() + DEMO_POLICY.sessionLifetimeSeconds * 1000),
      },
    });
    return { body: await sessionResponse(tx, session), token: freshToken, created: true };
  });
}

async function replayIntent(tx: Transaction, session: DemoSession, requestId: string, kind: SessionIntentKind): Promise<DemoRunIntentResponse | null> {
  const intent = await tx.sessionRunIntent.findUnique({
    where: { sessionId_requestId: { sessionId: session.id, requestId } },
    include: { run: { select: summarySelect } },
  });
  if (intent === null) return null;
  if (intent.kind !== kind) throw new ApplicationError("IDEMPOTENCY_CONFLICT");
  if (intent.run.expiresAt.getTime() <= wallNow().getTime()) throw new ApplicationError("NOT_FOUND");
  return { session: sessionSummary(session), run: runSummary(intent.run), created: false, replayed: true };
}

export async function resolveRunIntent(token: string | undefined, requestId: string, kind: SessionIntentKind): Promise<DemoRunIntentResponse> {
  const hash = sessionTokenHash(token);
  try {
    return await withTransaction(async (tx) => {
      let session = await requireSession(tx, hash);
      const previous = await replayIntent(tx, session, requestId, kind);
      if (previous !== null) return previous;
      let run = kind === "START" ? await activeRun(tx, session.id) : null;
      const created = run === null;
      if (created) {
        if (session.runCount >= DEMO_POLICY.maxRunsPerSession) throw new ApplicationError("RUN_LIMIT_REACHED");
        const reserved = await tx.demoSession.updateMany({
          where: { id: session.id, runCount: session.runCount, expiresAt: { gt: wallNow() } },
          data: { runCount: { increment: 1 } },
        });
        if (reserved.count !== 1) throw new ApplicationError("VERSION_CONFLICT");
        const snapshot = createScenarioSnapshot();
        const grams = toStoredGrams(snapshot.initialLot.quantityKg);
        const humidity = toStoredHumidity(snapshot.initialLot.humidityPercent);
        if (!grams.ok || !humidity.ok) throw new ApplicationError("INTERNAL_ERROR");
        const now = wallNow();
        run = await tx.demoRun.create({
          data: {
            sessionId: session.id,
            creationRequestId: requestId,
            ordinal: session.runCount + 1,
            scenarioVersion: snapshot.version,
            scenarioSnapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonObject,
            declaredGrams: grams.value,
            humidityHundredths: humidity.value,
            createdAt: now,
            expiresAt: new Date(now.getTime() + DEMO_POLICY.operationalRetentionDays * 86400 * 1000),
          },
        });
        session = { ...session, runCount: session.runCount + 1 };
      }
      // run existe tanto al crear como al retomar; la FK compuesta verifica el propietario.
      if (run === null) throw new ApplicationError("INTERNAL_ERROR");
      await tx.sessionRunIntent.create({ data: { sessionId: session.id, requestId, kind, runId: run.id } });
      return { session: sessionSummary(session), run: runSummary(run), created, replayed: false };
    });
  } catch (error) {
    const conflict = error instanceof ApplicationError && error.code === "VERSION_CONFLICT"
      || error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (!conflict) throw error;
    // Una lectura nueva tras rollback puede resolver un duplicado ya confirmado.
    // No se reejecuta automáticamente ninguna creación ni incremento.
    return withTransaction(async (tx) => {
      const session = await requireSession(tx, hash);
      const previous = await replayIntent(tx, session, requestId, kind);
      if (previous !== null) return previous;
      if (kind === "RESET" && session.runCount >= DEMO_POLICY.maxRunsPerSession) throw new ApplicationError("RUN_LIMIT_REACHED");
      throw new ApplicationError("VERSION_CONFLICT");
    });
  }
}

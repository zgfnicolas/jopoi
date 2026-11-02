import { now as wallNow } from "@/server/runtime/clock";
import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type DemoRun, type DemoSession, type SessionIntentKind } from "../../generated/prisma/client";
import { createScenarioSnapshot } from "../../domain/scenario";
import { DEMO_POLICY } from "../../shared/demo-policy";
import type { DemoRunIntentResponse, DemoRunSummary, DemoSessionResponse, DemoSessionSummary } from "../../shared/session-contracts";
import { ApplicationError } from "../application-error";
import { withDatabase, withTransaction } from "../database";
import { toStoredGrams, toStoredHumidity } from "../database/precision";
import { dailyCreationWindow, RateLimitError, reserveSessionIntent } from "../security/rate-limit";
import { newSessionToken, sessionTokenHash } from "./credentials";

type Transaction = Prisma.TransactionClient;
type RunSummaryRow = Pick<DemoRun, "traceId" | "state" | "version" | "expiresAt">;

const summarySelect = { id: true, traceId: true, state: true, version: true, expiresAt: true } as const;

export function sessionSummary(session: Pick<DemoSession, "expiresAt" | "runCount">): DemoSessionSummary {
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
  if (hash === undefined) throw new ApplicationError("SESSION_REQUIRED");
  return withTransaction(async (tx) => sessionResponse(tx, await requireSession(tx, hash)));
}

/** Solo invocada por el inicio explícito de sesión, nunca como fallback de comandos. */
export async function beginSession(token: string | undefined) {
  const hash = sessionTokenHash(token);
  return withDatabase(async (db) => {
    const now = wallNow();
    if (hash !== undefined) {
      const existing = await db.demoSession.findUnique({ where: { tokenHash: hash } });
      if (existing !== null && existing.expiresAt.getTime() > now.getTime()) {
        return { body: await sessionResponse(db, existing), token: undefined, created: false };
      }
    }
    const freshToken = newSessionToken();
    const freshHash = sessionTokenHash(freshToken);
    if (freshHash === undefined) throw new ApplicationError("INTERNAL_ERROR");
    const sessionExpiresAt = new Date(now.getTime() + DEMO_POLICY.sessionLifetimeSeconds * 1000);
    const { limit, start, expires, retryAfter } = dailyCreationWindow("SESSION_CREATE", now);
    const rows = await db.$queryRaw<Pick<DemoSession, "expiresAt" | "runCount">[]>(Prisma.sql`
      WITH quota AS (
        INSERT INTO "RequestRateBucket" ("scope", "subject", "windowStart", "used", "expiresAt")
        VALUES ('SESSION_CREATE', 'GLOBAL', ${start.toISOString()}::timestamptz, 1, ${expires.toISOString()}::timestamptz)
        ON CONFLICT ("scope", "subject", "windowStart") DO UPDATE
        SET "used" = "RequestRateBucket"."used" + 1
        WHERE "RequestRateBucket"."used" < ${limit}
        RETURNING "used"
      )
      INSERT INTO "DemoSession" ("id", "tokenHash", "runCount", "createdAt", "expiresAt")
      SELECT ${randomUUID()}::uuid, ${freshHash}, 0, ${now.toISOString()}::timestamptz, ${sessionExpiresAt.toISOString()}::timestamptz
      FROM quota
      RETURNING "expiresAt", "runCount"`);
    const created = rows[0];
    if (created === undefined) throw new RateLimitError(retryAfter);
    return { body: { session: sessionSummary(created), activeRun: null }, token: freshToken, created: true };
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
  if (hash === undefined) throw new ApplicationError("SESSION_REQUIRED");
  return withDatabase(db => db.$transaction(async (tx) => {
    const now = wallNow();
    const rows = await tx.$queryRaw<DemoSession[]>(Prisma.sql`
      SELECT "id", "tokenHash", "runCount", "createdAt", "expiresAt"
      FROM "DemoSession" WHERE "tokenHash" = ${hash} FOR UPDATE`);
    let session = rows[0];
    if (session === undefined) throw new ApplicationError("SESSION_REQUIRED");
    if (session.expiresAt.getTime() <= now.getTime()) throw new ApplicationError("SESSION_EXPIRED");
    const previous = await replayIntent(tx, session, requestId, kind);
    if (previous !== null) return previous;
    await reserveSessionIntent(tx, session, now);
    let run = kind === "START" ? await activeRun(tx, session.id) : null;
    const created = run === null;
    if (created) {
      if (session.runCount >= DEMO_POLICY.maxRunsPerSession) throw new ApplicationError("RUN_LIMIT_REACHED");
      await tx.demoSession.update({ where: { id: session.id }, data: { runCount: { increment: 1 } } });
      const snapshot = createScenarioSnapshot();
      const grams = toStoredGrams(snapshot.initialLot.quantityKg), humidity = toStoredHumidity(snapshot.initialLot.humidityPercent);
      if (!grams.ok || !humidity.ok) throw new ApplicationError("INTERNAL_ERROR");
      run = await tx.demoRun.create({
        data: {
          sessionId: session.id, creationRequestId: requestId, ordinal: session.runCount + 1,
          scenarioVersion: snapshot.version, scenarioSnapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonObject,
          declaredGrams: grams.value, humidityHundredths: humidity.value,
          createdAt: now, expiresAt: new Date(now.getTime() + DEMO_POLICY.operationalRetentionDays * 86400 * 1000),
        },
      });
      session = { ...session, runCount: session.runCount + 1 };
    }
    if (run === null) throw new ApplicationError("INTERNAL_ERROR");
    await tx.sessionRunIntent.create({ data: { sessionId: session.id, requestId, kind, runId: run.id } });
    return { session: sessionSummary(session), run: runSummary(run), created, replayed: false };
  }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 5000 }));
}

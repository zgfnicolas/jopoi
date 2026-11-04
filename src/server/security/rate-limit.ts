import "server-only";
import { performance } from "node:perf_hooks";
import { Prisma } from "../../generated/prisma/client";
import { DEMO_POLICY } from "../../shared/demo-policy";
import { now } from "@/server/runtime/clock";
import { clientIdentity } from "@/server/runtime/client-identity";
import { getDeadlinePolicy } from "@/server/runtime/deadlines";
import { ApplicationError } from "../application-error";
import { withDatabase } from "../database";
import { getServerConfig, requireConfiguration } from "../config";
import { sqlStepBudget } from "../deadlines";
import { currentRequestContext } from "../diagnostics";
import { sessionTokenHash } from "../sessions/credentials";
import { runIntentSubject, visitorSubject } from "./visitor-identity";
export { runIntentSubject } from "./visitor-identity";

export const RATE_POLICIES = Object.freeze({
  SESSION: { visitor: 20, global: 200, seconds: 600 },
  CONTACT: { visitor: 5, global: 100, seconds: 3600 },
  VERIFICATION: { visitor: 30, global: 300, seconds: 60 },
  TRACE: { visitor: 120, global: 1000, seconds: 60 },
});

export const SESSION_RATE_POLICIES = Object.freeze({
  PRIVATE_READ: { session: 30, global: 1000, seconds: 60 },
  MUTATION: { session: 10, global: 100, seconds: 60 },
  PUBLICATION: { session: 6, global: 60, seconds: 60 },
});

export const CREATION_POLICIES = Object.freeze({
  SESSION_CREATE: { global: DEMO_POLICY.sessionDailyLimit, seconds: 86400 },
  CONTACT_CREATE: { global: DEMO_POLICY.contactDailyLimit, seconds: 86400 },
  INTENT_CREATE: { global: DEMO_POLICY.intentDailyLimit, seconds: 86400 },
});

export const INTENT_POLICIES = Object.freeze({
  RUN_INTENT: { limit: DEMO_POLICY.maxReceiptsPerRun },
  SESSION_INTENT: { limit: DEMO_POLICY.maxReceiptsPerRun },
});

export class RateLimitError extends ApplicationError {
  constructor(readonly retryAfter: number) {
    super("RATE_LIMITED", undefined, { retryAfterSeconds: retryAfter });
  }
}

function retryAfterUntil(end: Date, current: Date = now()): number {
  return Math.min(86400, Math.max(1, Math.ceil((end.getTime() - current.getTime()) / 1000)));
}

export function dailyCreationWindow(scope: keyof typeof CREATION_POLICIES, at: Date = now()) {
  const policy = CREATION_POLICIES[scope];
  if (!policy || !Number.isSafeInteger(policy.global) || policy.global < 1 || policy.seconds !== 86400 || !Number.isFinite(at.getTime())) {
    throw new ApplicationError("CONFIGURATION_UNAVAILABLE");
  }
  const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const end = new Date(start.getTime() + 86400000);
  const expires = new Date(end.getTime() + 48 * 3600000);
  return { limit: policy.global, start, end, expires, retryAfter: retryAfterUntil(end, at) };
}

async function consumeBucket(
  tx: Prisma.TransactionClient,
  scope: string,
  subject: string,
  start: Date,
  expires: Date,
  limit: number,
  retryAfter: number,
): Promise<void> {
  const rows = await tx.$queryRaw<{ used: number }[]>(Prisma.sql`
    INSERT INTO "RequestRateBucket" ("scope", "subject", "windowStart", "used", "expiresAt")
    VALUES (${scope}, ${subject}, ${start.toISOString()}::timestamptz, 1, ${expires.toISOString()}::timestamptz)
    ON CONFLICT ("scope", "subject", "windowStart") DO UPDATE
    SET "used" = "RequestRateBucket"."used" + 1
    WHERE "RequestRateBucket"."used" < ${limit}
    RETURNING "used"`);
  if (rows.length !== 1) throw new RateLimitError(retryAfter);
}

/** Admisión de solicitudes públicas por ventana UTC fija: las solicitudes fallidas o replays también consumen ventana. */
export async function requireRateLimit(request: Request, scope: keyof typeof RATE_POLICIES): Promise<void> {
  const policy = RATE_POLICIES[scope];
  const at = now();
  if (!policy || !Number.isFinite(at.getTime())) throw new ApplicationError("CONFIGURATION_UNAVAILABLE");
  const start = new Date(Math.floor(at.getTime() / (policy.seconds * 1000)) * policy.seconds * 1000);
  const end = new Date(start.getTime() + policy.seconds * 1000);
  const expires = new Date(end.getTime() + 48 * 3600000);
  const { secret } = requireConfiguration(getServerConfig().session());
  const subject = visitorSubject(secret, at, scope, clientIdentity(request));
  const retryAfter = retryAfterUntil(end, at);
  const context = currentRequestContext();
  const { maxWait, timeout } = sqlStepBudget(getDeadlinePolicy(), context ? context.deadlineAt - performance.now() : undefined);
  await withDatabase(db => db.$transaction(async tx => {
    for (const [key, limit] of [["GLOBAL", policy.global], [subject, policy.visitor]] as const) {
      await consumeBucket(tx, scope, key, start, expires, limit, retryAfter);
    }
  }, { isolationLevel: "ReadCommitted", maxWait, timeout }));
}

/** Reserva por minuto por sesión y global dentro de una transacción abierta o de admisión privada. */
export async function reserveSessionRateLimit(
  tx: Prisma.TransactionClient,
  tokenHash: string,
  scope: keyof typeof SESSION_RATE_POLICIES,
  at: Date = now(),
): Promise<void> {
  const policy = SESSION_RATE_POLICIES[scope];
  if (!policy || !Number.isSafeInteger(policy.session) || policy.session < 1 || !Number.isSafeInteger(policy.global) || policy.global < 1 || !Number.isFinite(at.getTime())) {
    throw new ApplicationError("CONFIGURATION_UNAVAILABLE");
  }
  const start = new Date(Math.floor(at.getTime() / (policy.seconds * 1000)) * policy.seconds * 1000);
  const end = new Date(start.getTime() + policy.seconds * 1000);
  const expires = new Date(end.getTime() + 48 * 3600000);
  const retryAfter = retryAfterUntil(end, at);
  for (const [key, limit] of [["GLOBAL", policy.global], [tokenHash, policy.session]] as const) {
    await consumeBucket(tx, scope, key, start, expires, limit, retryAfter);
  }
}

/** Admisión temprana privada: exige credencial firmada válida en formato antes de abrir transacción en PostgreSQL. */
export async function requireSessionRateLimit(
  token: string | undefined,
  scope: keyof typeof SESSION_RATE_POLICIES,
): Promise<string> {
  const tokenHash = sessionTokenHash(token);
  if (!tokenHash) throw new ApplicationError("SESSION_REQUIRED");
  const at = now();
  const context = currentRequestContext();
  const { maxWait, timeout } = sqlStepBudget(getDeadlinePolicy(), context ? context.deadlineAt - performance.now() : undefined);
  await withDatabase(db => db.$transaction(tx => reserveSessionRateLimit(tx, tokenHash, scope, at), {
    isolationLevel: "ReadCommitted",
    maxWait,
    timeout,
  }));
  return tokenHash;
}

/** Reserva diaria UTC atómica con la creación real; las recuperaciones y replays no consumen este techo. */
export async function reserveDailyCreation(
  tx: Prisma.TransactionClient,
  scope: keyof typeof CREATION_POLICIES,
  at: Date = now(),
): Promise<void> {
  const { limit, start, expires, retryAfter } = dailyCreationWindow(scope, at);
  await consumeBucket(tx, scope, "GLOBAL", start, expires, limit, retryAfter);
}

/** Reserva nueva intención en un recorrido (máx. 100 recibos por recorrido + 5.000/día global UTC). */
export async function reserveRunIntent(
  tx: Prisma.TransactionClient,
  run: { readonly id: string; readonly createdAt: Date; readonly expiresAt: Date },
  sessionExpiresAt: Date,
  at: Date = now(),
): Promise<void> {
  const limit = INTENT_POLICIES.RUN_INTENT.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isFinite(at.getTime())) throw new ApplicationError("CONFIGURATION_UNAVAILABLE");
  const end = new Date(Math.min(run.expiresAt.getTime(), sessionExpiresAt.getTime()));
  const expires = new Date(run.expiresAt.getTime() + 48 * 3600000);
  await consumeBucket(tx, "RUN_INTENT", runIntentSubject(run.id), run.createdAt, expires, limit, retryAfterUntil(end, at));
  await reserveDailyCreation(tx, "INTENT_CREATE", at);
}

/** Reserva nueva intención de recorrido en la sesión (máx. 100 por sesión + 5.000/día global UTC). */
export async function reserveSessionIntent(
  tx: Prisma.TransactionClient,
  session: { readonly tokenHash: string; readonly createdAt: Date; readonly expiresAt: Date },
  at: Date = now(),
): Promise<void> {
  const limit = INTENT_POLICIES.SESSION_INTENT.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isFinite(at.getTime())) throw new ApplicationError("CONFIGURATION_UNAVAILABLE");
  const expires = new Date(session.expiresAt.getTime() + 48 * 3600000);
  await consumeBucket(tx, "SESSION_INTENT", session.tokenHash, session.createdAt, expires, limit, retryAfterUntil(session.expiresAt, at));
  await reserveDailyCreation(tx, "INTENT_CREATE", at);
}

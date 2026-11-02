import "server-only";
import { Prisma } from "../../generated/prisma/client";
import { DEMO_POLICY } from "../../shared/demo-policy";
import { now } from "@/server/runtime/clock";
import { clientIdentity } from "@/server/runtime/client-identity";
import { ApplicationError } from "../application-error";
import { withDatabase } from "../database";
import { getServerConfig, requireConfiguration } from "../config";
import { visitorSubject } from "./visitor-identity";

export const RATE_POLICIES = Object.freeze({
  SESSION: { visitor: 20, global: 200, seconds: 600 },
  CONTACT: { visitor: 5, global: 100, seconds: 3600 },
  VERIFICATION: { visitor: 30, global: 300, seconds: 60 },
  TRACE: { visitor: 120, global: 1000, seconds: 60 },
});

export const CREATION_POLICIES = Object.freeze({
  SESSION_CREATE: { global: DEMO_POLICY.sessionDailyLimit, seconds: 86400 },
  CONTACT_CREATE: { global: DEMO_POLICY.contactDailyLimit, seconds: 86400 },
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

/** Admisión de solicitudes por ventana UTC fija: las solicitudes fallidas o replays también consumen ventana. */
export async function requireRateLimit(request: Request, scope: keyof typeof RATE_POLICIES): Promise<void> {
  const policy = RATE_POLICIES[scope];
  const at = now();
  if (!policy || !Number.isFinite(at.getTime())) throw new ApplicationError("CONFIGURATION_UNAVAILABLE");
  const start = new Date(Math.floor(at.getTime() / (policy.seconds * 1000)) * policy.seconds * 1000);
  const end = new Date(start.getTime() + policy.seconds * 1000);
  const expires = new Date(end.getTime() + 48 * 3600000);
  const { secret } = requireConfiguration(getServerConfig().session());
  const subject = visitorSubject(secret, at, scope, clientIdentity(request));
  await withDatabase(db => db.$transaction(async tx => {
    for (const [key, limit] of [["GLOBAL", policy.global], [subject, policy.visitor]] as const) {
      const rows = await tx.$queryRaw<{ used: number }[]>(Prisma.sql`
        INSERT INTO "RequestRateBucket" ("scope", "subject", "windowStart", "used", "expiresAt")
        VALUES (${scope}, ${key}, ${start.toISOString()}::timestamptz, 1, ${expires.toISOString()}::timestamptz)
        ON CONFLICT ("scope", "subject", "windowStart") DO UPDATE
        SET "used" = "RequestRateBucket"."used" + 1
        WHERE "RequestRateBucket"."used" < ${limit}
        RETURNING "used"`);
      if (rows.length !== 1) throw new RateLimitError(retryAfterUntil(end, at));
    }
  }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 5000 }));
}

/** Reserva diaria UTC atómica con la creación real; las recuperaciones y replays no consumen este techo. */
export async function reserveDailyCreation(
  tx: Prisma.TransactionClient,
  scope: keyof typeof CREATION_POLICIES,
  at: Date = now(),
): Promise<void> {
  const { limit, start, expires, retryAfter } = dailyCreationWindow(scope, at);
  const rows = await tx.$queryRaw<{ used: number }[]>(Prisma.sql`
    INSERT INTO "RequestRateBucket" ("scope", "subject", "windowStart", "used", "expiresAt")
    VALUES (${scope}, 'GLOBAL', ${start.toISOString()}::timestamptz, 1, ${expires.toISOString()}::timestamptz)
    ON CONFLICT ("scope", "subject", "windowStart") DO UPDATE
    SET "used" = "RequestRateBucket"."used" + 1
    WHERE "RequestRateBucket"."used" < ${limit}
    RETURNING "used"`);
  if (rows.length !== 1) throw new RateLimitError(retryAfter);
}

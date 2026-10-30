import "server-only";
import { createHmac } from "node:crypto";
import { Prisma } from "../../generated/prisma/client";
import { now } from "@/server/runtime/clock";
import { clientIdentity } from "@/server/runtime/client-identity";
import { ApplicationError } from "../application-error";
import { withDatabase } from "../database";
import { getServerConfig, requireConfiguration } from "../config";

export const RATE_POLICIES = Object.freeze({
  SESSION: { visitor: 20, global: 200, seconds: 600 },
  CONTACT: { visitor: 5, global: 100, seconds: 3600 },
  VERIFICATION: { visitor: 30, global: 300, seconds: 60 },
  TRACE: { visitor: 120, global: 1000, seconds: 60 },
});

export class RateLimitError extends ApplicationError {
  constructor(readonly retryAfter: number) { super("RATE_LIMITED"); }
}

/** Admission is independent of domain writes: failed requests still consume capacity.
 * The global and visitor reservations commit together; rejection rolls both back. */
export async function requireRateLimit(request: Request, scope: keyof typeof RATE_POLICIES): Promise<void> {
  const policy = RATE_POLICIES[scope], at = now();
  const start = new Date(Math.floor(at.getTime() / (policy.seconds * 1000)) * policy.seconds * 1000);
  const end = new Date(start.getTime() + policy.seconds * 1000);
  const expires = new Date(end.getTime() + 48 * 3600000);
  const { secret } = requireConfiguration(getServerConfig().session());
  const subject = createHmac("sha256", secret).update(`s21-rate-v1\0${at.toISOString().slice(0, 10)}\0${scope}\0${clientIdentity(request)}`).digest("hex");
  await withDatabase(db => db.$transaction(async tx => {
    for (const [key, limit] of [["GLOBAL", policy.global], [subject, policy.visitor]] as const) {
      const rows = await tx.$queryRaw<{ used: number }[]>(Prisma.sql`
        INSERT INTO "RequestRateBucket" ("scope", "subject", "windowStart", "used", "expiresAt")
        VALUES (${scope}, ${key}, ${start.toISOString()}::timestamptz, 1, ${expires.toISOString()}::timestamptz)
        ON CONFLICT ("scope", "subject", "windowStart") DO UPDATE
        SET "used" = "RequestRateBucket"."used" + 1
        WHERE "RequestRateBucket"."used" < ${limit}
        RETURNING "used"`);
      if (rows.length !== 1) throw new RateLimitError(Math.max(1, Math.ceil((end.getTime() - now().getTime()) / 1000)));
    }
  }, { isolationLevel: "ReadCommitted", maxWait: 2000, timeout: 5000 }));
}

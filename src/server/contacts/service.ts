import { now as wallNow } from "@/server/runtime/clock";
import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client";
import { DEMO_REQUEST_CONFIRMATION, type DemoRequestConfirmation } from "../../shared/contact-contracts";
import { DEMO_POLICY } from "../../shared/demo-policy";
import { ApplicationError } from "../application-error";
import { withDatabase } from "../database";
import { reserveDailyCreation } from "../security/rate-limit";
import type { NormalizedDemoRequestInput } from "./input";

function confirmation(row: { id: string; createdAt: Date }): DemoRequestConfirmation {
  return { id: row.id, createdAt: row.createdAt.toISOString(), message: DEMO_REQUEST_CONFIRMATION };
}

export async function submitDemoRequest(input: NormalizedDemoRequestInput) {
  const intentHash = createHash("sha256").update(JSON.stringify([
    "demo-request-v1", input.name, input.email, input.company, input.message,
  ])).digest("hex");

  return withDatabase(async (db) => db.$transaction(async (tx) => {
    const now = wallNow();
    const expiresAt = new Date(now.getTime() + DEMO_POLICY.contactRetentionDays * 86400 * 1000);
    const id = randomUUID();
    // La restricción única decide quién crea; el replay existente no consume otra reserva diaria.
    const inserted = await tx.$queryRaw<{ id: string; createdAt: Date }[]>(Prisma.sql`
      INSERT INTO "DemoRequest" ("id", "requestId", "intentHash", "name", "email", "company", "message", "createdAt", "expiresAt")
      VALUES (${id}::uuid, ${input.requestId}::uuid, ${intentHash}, ${input.name}, ${input.email}, ${input.company}, ${input.message}, ${now.toISOString()}::timestamptz, ${expiresAt.toISOString()}::timestamptz)
      ON CONFLICT ("requestId") DO NOTHING
      RETURNING "id", "createdAt"`);
    const created = inserted[0];
    if (created !== undefined) {
      await reserveDailyCreation(tx, "CONTACT_CREATE", now);
      return { body: confirmation(created), created: true };
    }
    const row = await tx.demoRequest.findUnique({
      where: { requestId: input.requestId },
      select: { id: true, createdAt: true, expiresAt: true, intentHash: true },
    });
    if (row === null) throw new ApplicationError("VERSION_CONFLICT");
    if (row.expiresAt.getTime() <= wallNow().getTime()) throw new ApplicationError("DEMO_REQUEST_EXPIRED");
    if (row.intentHash !== intentHash) throw new ApplicationError("IDEMPOTENCY_CONFLICT");
    return { body: confirmation(row), created: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 5000 }));
}

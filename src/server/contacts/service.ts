import { now as wallNow } from "@/server/runtime/clock";
import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "../../generated/prisma/client";
import { DEMO_REQUEST_CONFIRMATION, type DemoRequestConfirmation } from "../../shared/contact-contracts";
import { DEMO_POLICY } from "../../shared/demo-policy";
import { ApplicationError } from "../application-error";
import { withDatabase } from "../database";
import type { NormalizedDemoRequestInput } from "./input";

function confirmation(row: { id: string; createdAt: Date }): DemoRequestConfirmation {
  return { id: row.id, createdAt: row.createdAt.toISOString(), message: DEMO_REQUEST_CONFIRMATION };
}

export async function submitDemoRequest(input: NormalizedDemoRequestInput) {
  const intentHash = createHash("sha256").update(JSON.stringify([
    "demo-request-v1", input.name, input.email, input.company, input.message,
  ])).digest("hex");

  return withDatabase(async (db) => {
    try {
      const now = wallNow();
      const row = await db.demoRequest.create({
        data: {
          ...input,
          intentHash,
          createdAt: now,
          expiresAt: new Date(now.getTime() + DEMO_POLICY.contactRetentionDays * 86400 * 1000),
        },
        select: { id: true, createdAt: true },
      });
      return { body: confirmation(row), created: true };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      // La restricción única decide quién crea. No hay read-before-write ni upsert que cambie el contacto.
      const row = await db.demoRequest.findUnique({
        where: { requestId: input.requestId },
        select: { id: true, createdAt: true, expiresAt: true, intentHash: true },
      });
      if (row === null) throw new ApplicationError("VERSION_CONFLICT");
      if (row.expiresAt.getTime() <= wallNow().getTime()) throw new ApplicationError("DEMO_REQUEST_EXPIRED");
      if (row.intentHash !== intentHash) throw new ApplicationError("IDEMPOTENCY_CONFLICT");
      return { body: confirmation(row), created: false };
    }
  });
}

import { now as wallNow } from "@/server/runtime/clock";
import "server-only";
import { after } from "next/server";
import { withTransaction } from "../database";
import { createCoordinator, type CoordinationContext } from "./coordinator";
import { createHcsProvider } from "@/server/runtime/network";

export function serverCoordinationContext(): CoordinationContext {
  return { transaction: withTransaction, provider: createHcsProvider(process.env), environment: process.env, now: () => wallNow() };
}

/** A committed command remains saved even if background registration/work fails. */
export function schedulePublications(traceId: string): void {
  try {
    after(async () => {
      try {
        const context = serverCoordinationContext();
        await createCoordinator(context).drain({ traceId, maxEvents: 5, deadline: context.now().getTime() + 45000 });
      } catch { console.error("PUBLICATION_WORK_PENDING"); }
    });
  } catch { console.error("PUBLICATION_WORK_NOT_SCHEDULED"); }
}

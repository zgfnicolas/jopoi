import { now as wallNow } from "@/server/runtime/clock";
import "server-only";
import { after } from "next/server";
import { withTransaction } from "../database";
import { createCoordinator, type CoordinationContext } from "./coordinator";
import { createHcsProvider } from "@/server/runtime/network";
import { childContext, currentRequestContext, withRequestContext, logDiagnostic } from "../diagnostics";
import { performance } from "node:perf_hooks";

export function serverCoordinationContext(): CoordinationContext {
  return { transaction: withTransaction, provider: createHcsProvider(process.env), environment: process.env, now: () => wallNow() };
}

/** A committed command remains saved even if background registration/work fails. */
export function schedulePublications(traceId: string): void {
  const parent = currentRequestContext();
  if (!parent) {
    logDiagnostic({ event: "background.completed", outcome: "error", severity: "ERROR", code: "PUBLICATION_WORK_NOT_SCHEDULED", durationMs: 0, error: new Error("REQUEST_CONTEXT_MISSING") });
    return;
  }
  const diagnostic = childContext(parent, "publications.drain");
  diagnostic.businessTraceId = traceId;
  const started = performance.now();
  try {
    after(() => withRequestContext(diagnostic, async () => {
      try {
        const context = serverCoordinationContext();
        const result = await createCoordinator(context).drain({ traceId, maxEvents: 5, deadline: context.now().getTime() + 45000 });
        logDiagnostic({ event: "background.completed", outcome: result.hasMore ? "partial" : "success", code: result.hasMore ? "PUBLICATION_WORK_PENDING" : "OK", durationMs: performance.now() - started, counts: { processed: result.processed } });
      } catch (error) { logDiagnostic({ event: "background.completed", outcome: "error", severity: "ERROR", code: "PUBLICATION_WORK_PENDING", durationMs: performance.now() - started, error }); }
    }));
  } catch (error) { withRequestContext(diagnostic, () => logDiagnostic({ event: "background.completed", outcome: "error", severity: "ERROR", code: "PUBLICATION_WORK_NOT_SCHEDULED", durationMs: performance.now() - started, error })); }
}

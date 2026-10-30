import type { runMaintenance } from "./maintenance-core";

/** Explicit operational allowlist: no rows, request headers, provider exceptions or identifiers. */
export function logMaintenanceResult(result: Awaited<ReturnType<typeof runMaintenance>>) {
  if (result.skipped) { console.info(JSON.stringify({ code: "MAINTENANCE_SKIPPED", executionId: result.executionId, durationMs: result.durationMs })); return; }
  console.info(JSON.stringify({ code: result.complete ? "MAINTENANCE_COMPLETE" : "MAINTENANCE_PARTIAL",
    executionId: result.executionId, durationMs: result.durationMs,
    counts: result.counts && { runs: result.counts.runs, contacts: result.counts.contacts, sessions: result.counts.sessions, quotas: result.counts.quotas, leases: result.counts.leases, rateBuckets: result.counts.rateBuckets },
    cleanupComplete: result.cleanupComplete, publications: result.publications && { processed: result.publications.processed, hasMore: result.publications.hasMore },
    publicationError: result.publicationError === null ? null : "PUBLICATION_WORK_PENDING" }));
}

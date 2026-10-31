import type { runMaintenance } from "./maintenance-core";
import { logDiagnostic } from "../diagnostics";

/** Explicit operational allowlist: no rows, request headers, provider exceptions or identifiers. */
export function logMaintenanceResult(result: Awaited<ReturnType<typeof runMaintenance>>) {
  logDiagnostic({ event: "maintenance.completed", code: result.skipped ? "MAINTENANCE_SKIPPED" : result.complete ? "MAINTENANCE_COMPLETE" : "MAINTENANCE_PARTIAL",
    outcome: result.skipped ? "skipped" : result.complete ? "success" : "partial", durationMs: result.durationMs,
    ...(result.counts === undefined ? {} : { counts: result.counts }) });
}

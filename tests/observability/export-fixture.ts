import { setImmediate } from "node:timers/promises";
import { createRequestContext, childContext, withRequestContext, bindBusinessTraceId, logDiagnostic, measureDependency } from "../../src/server/diagnostics";
import { ApplicationError } from "../../src/server/application-error";
import { HcsError, preserveHcsCause, hcsCause, type NetworkOutcome } from "../../src/server/hedera/contracts";
import { mapDatabaseError } from "../../src/server/database/errors";

const marker = process.env.DIAGNOSTIC_SECRET_MARKER;
if (!marker) throw new Error("OBSERVABILITY_FIXTURE_MARKER_MISSING");
const cause = Object.assign(new Error(marker), { code: "ECONNREFUSED", query: marker, signedTransactionBytes: marker, meta: { driverAdapterError: { cause: { originalCode: "23514", parameters: [marker] } } } });
cause.stack = `Error: ${marker}\n at ${marker} (C:/private-owner/src/server/database/index.ts:35:5)\n at ${marker} (C:/private-owner/private-token.ts:99:1)`;
const mapped = mapDatabaseError(cause);
if (!(mapped instanceof ApplicationError) || mapped.cause !== cause) throw new Error("SQL_CAUSE_LOST");
const hcs = new HcsError("HCS_UNAVAILABLE", { cause: mapped });
if (hcs.cause !== mapped) throw new Error("HCS_CAUSE_LOST");
const outcome = preserveHcsCause<NetworkOutcome>({ kind: "unknown", code: "HCS_RESULT_UNKNOWN" }, hcs);
if (hcsCause(outcome) !== hcs || JSON.stringify(outcome).includes(marker)) throw new Error("HCS_OUTCOME_CAUSE_EXPOSED_OR_LOST");
Object.defineProperty(cause, "cause", { value: hcs }); // La exportación también debe acotar ciclos.
await Promise.all(Array.from({ length: 24 }, (_, index) => {
  const context = createRequestContext("runs.command");
  return withRequestContext(context, async () => {
    bindBusinessTraceId("00000000-0000-4000-8000-000000000000");
    await setImmediate();
    await measureDependency("database.query", async () => { await setImmediate(); return index; });
    const hostileCounts = Object.defineProperty({}, "processed", { get() { throw new Error(marker); } });
    logDiagnostic({ event: "http.completed", outcome: "error", code: "INTERNAL_ERROR", durationMs: 0, counts: hostileCounts });
    const input = Object.assign({ event: "http.completed" as const, outcome: "error" as const, severity: "ERROR" as const, code: "INTERNAL_ERROR" as const, durationMs: 2, status: 500, error: hcs },
      { body: marker, authorization: marker, cookie: marker, password: marker, email: marker, signedBytes: marker, counts: { processed: index, password: 123 } });
    logDiagnostic(input);
    await withRequestContext(childContext(context, "publications.drain"), async () => {
      await setImmediate();
      logDiagnostic({ event: "background.completed", outcome: "success", code: "OK", durationMs: 1 });
    });
  });
}));
process.stdout.write("FUNCTIONAL_STDOUT\n");

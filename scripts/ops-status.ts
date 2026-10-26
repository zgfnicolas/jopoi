import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CliEnvironmentError, environmentOption, loadCliEnvironment } from "../src/server/config/cli-environment";
import { createConfigReader } from "../src/server/config/environment";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
async function main() {
  const { args, file } = environmentOption(process.argv.slice(2));
  if (args.length === 1 && args[0] === "--help") {
    console.log("ops:status -- --env-file ARCHIVO\nSolo lectura SQL explícita: conteos, códigos seguros y fecha del último mantenimiento completo.\nNo muestra contactos, IDs, conexiones, bytes, claves ni leases privados. No ejecuta mantenimiento ni Hedera."); return;
  }
  if (args.length !== 0 || file === undefined) throw new CliEnvironmentError("INVALID_CLI_ARGUMENTS");
  loadCliEnvironment(ROOT, file);
  const configuration = createConfigReader(process.env).database();
  if (configuration.status !== "configured") { console.error("DATABASE_UNAVAILABLE"); process.exitCode = 1; return; }
  const { createDatabaseClient } = await import("../src/server/database/client");
  const { HCS_CODES } = await import("../src/server/hedera/contracts");
  const db = createDatabaseClient(configuration.config.url);
  try {
    const observedAt = new Date();
    const report = await db.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const publication = await tx.hcsPublication.groupBy({ by: ["state"], _count: { _all: true } });
      const verification = await tx.hcsPublication.groupBy({ by: ["verificationState"], _count: { _all: true } });
      const attempts = await tx.hcsSubmissionAttempt.groupBy({ by: ["kind", "state"], _count: { _all: true } });
      const errors = await tx.hcsPublication.groupBy({ by: ["lastErrorCode"], where: { lastErrorCode: { not: null } }, _count: { _all: true } });
      const expiredRuns = await tx.demoRun.count({ where: { expiresAt: { lte: observedAt } } });
      const expiredContacts = await tx.demoRequest.count({ where: { expiresAt: { lte: observedAt } } });
      const maintenance = await tx.maintenanceLease.findUnique({ where: { name: "DAILY_MAINTENANCE" }, select: { lastCompletedDate: true } });
      const safeErrors: Record<string, number> = {};
      for (const row of errors) {
        const code = HCS_CODES.find(code => code === row.lastErrorCode) ?? "UNKNOWN_PUBLICATION_ERROR";
        safeErrors[code] = (safeErrors[code] ?? 0) + row._count._all;
      }
      return { publication: Object.fromEntries(publication.map(row => [row.state, row._count._all])),
        verification: Object.fromEntries(verification.map(row => [row.verificationState, row._count._all])),
        attempts: attempts.map(row => ({ kind: row.kind, state: row.state, count: row._count._all })), errors: safeErrors,
        expiredAwaitingCleanup: { runs: expiredRuns, contacts: expiredContacts }, lastCompletedMaintenanceDate: maintenance?.lastCompletedDate?.toISOString() ?? null };
    }, { isolationLevel: "RepeatableRead", maxWait: 2000, timeout: 5000 });
    console.log(JSON.stringify({ code: "OPERATIONS_OBSERVED", observedAt: observedAt.toISOString(), ...report }));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof CliEnvironmentError ? error.code : "OPERATIONS_STATUS_UNAVAILABLE"); process.exitCode = error instanceof CliEnvironmentError && error.code === "INVALID_CLI_ARGUMENTS" ? 2 : 1; });

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import type { Client } from "pg";
import {
  MIGRATION_ADVISORY_LOCK_ID,
  acquireMigrationLock,
  releaseMigrationLock,
  evaluateRolloutRestoreReport,
  type RolloutRestoreReport,
  type BatchBackfillResult,
  type CoexistenceEvaluationResult,
  type QuarantineEvaluationResult,
  type RestoreComparisonResult,
  type HcsReconciliationResult,
} from "../../scripts/lib/rollout-restore-model";

function createValidTestReport(): RolloutRestoreReport {
  const batchBackfillStats: BatchBackfillResult = {
    tableName: "DemoSession",
    totalProcessed: 20,
    batchesCount: 4,
    durationMs: 45.2,
    completed: true,
  };

  const coexistence: CoexistenceEvaluationResult = {
    sessionCoexistence: true,
    rateLimitCoexistence: true,
    capacitySlotsCoexistence: true,
    telemetryContextCoexistence: true,
    backwardCompatible: true,
    passed: true,
  };

  const quarantineResult: QuarantineEvaluationResult = {
    totalInspected: 10,
    validCount: 10,
    invalidCount: 0,
    quarantined: [],
    noDataFabricationConfirmed: true,
    immutableDigestsConfirmed: true,
    passed: true,
  };

  const restoreComparison: RestoreComparisonResult = {
    tables: [
      { tableName: "DemoSession", sourceCount: 10, targetCount: 10, countMatch: true, hashesMatch: true },
      { tableName: "DemoRun", sourceCount: 20, targetCount: 20, countMatch: true, hashesMatch: true },
      { tableName: "OperationEvent", sourceCount: 50, targetCount: 50, countMatch: true, hashesMatch: true },
      { tableName: "CommandReceipt", sourceCount: 50, targetCount: 50, countMatch: true, hashesMatch: true },
      { tableName: "HcsPublication", sourceCount: 50, targetCount: 50, countMatch: true, hashesMatch: true },
    ],
    stateParity: true,
    payloadParity: true,
    digestParity: true,
    externalIdentitiesParity: true,
    allTablesMatched: true,
    passed: true,
  };

  const hcsReconciliation: HcsReconciliationResult = {
    uncertainEventsCount: 2,
    alreadySequencedCount: 1,
    reconciledWithoutDuplication: 1,
    pendingRetryCount: 1,
    ledgerReversionAttempted: false,
    passed: true,
  };

  return {
    revision: "abcdef0123456789abcdef0123456789abcdef01",
    dirty: false,
    fingerprint: "11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff",
    generatedAt: "2026-11-15T00:00:00.000Z",
    environment: "OWNED_POSTGRES_17_CLUSTER",
    runner: {
      isSingleRunnerEnforced: true,
      separateAdminConnectionUsed: true,
      migrationDuringBuildPrevented: true,
      dbPushAndMigrateDevForbidden: true,
      migrationChecksumsValid: true,
      advisoryLockAcquiredAndReleased: true,
    },
    expandBackfillSwitch: {
      expandAppliedWithLockTimeout: true,
      batchBackfillCompleted: true,
      batchBackfillStats,
      switchConstraintValidated: true,
      coexistence,
    },
    invalidHistoricalState: {
      detectionBlockedValidation: true,
      noDataFabrication: true,
      digestsUnmodified: true,
      appliedMigrationsUnedited: true,
      quarantineResult,
    },
    restoreAndRecovery: {
      isolatedRestoreCompleted: true,
      restoreComparison,
      hcsReconciliation,
      sqlRestoreDoesNotRevertLedger: true,
    },
    codeRollback: {
      backwardCompatibilityPreserved: true,
      destructiveContractDeferred: true,
      rpoRtoRealisticSeparation: true,
    },
    separationOfConcerns: {
      localProvenRollout: true,
      providerPending: true,
      globalAcceptance: false,
      pendingExternalVerification: [
        "Verificación de backups automatizados gestionados en Neon / proveedor real (Ticket 31)",
        "Acreditación de permisos de roles y TLS verify-full en conexión remota real (Ticket 31)",
        "Medición de RTO/RPO real en infraestructura de nube vs simulación local (Ticket 31)",
      ],
    },
    passed: true,
  };
}

test("S22-29 / D17 / D19: Runner único previene carreras mediante Advisory Lock PostgreSQL", async () => {
  assert.equal(MIGRATION_ADVISORY_LOCK_ID, 2026111529, "El ID de advisory lock debe ser unívoco");

  // Mock de cliente PostgreSQL que simula comportamiento de pg_try_advisory_lock
  let locked = false;
  const mockClient = {
    async query(sql: string, params?: unknown[]) {
      if (sql.includes("pg_try_advisory_lock")) {
        if (!locked) {
          locked = true;
          return { rows: [{ acquired: true }] };
        }
        return { rows: [{ acquired: false }] };
      }
      if (sql.includes("pg_advisory_unlock")) {
        locked = false;
        return { rows: [{ released: true }] };
      }
      return { rows: [] };
    },
  };

  const firstAttempt = await acquireMigrationLock(mockClient as unknown as Client);
  assert.equal(firstAttempt, true, "El primer runner debe adquirir el lock exitosamente");

  const secondAttempt = await acquireMigrationLock(mockClient as unknown as Client);
  assert.equal(secondAttempt, false, "Un segundo runner concurrente debe ser rechazado (falla cerrado)");

  const released = await releaseMigrationLock(mockClient as unknown as Client);
  assert.equal(released, true, "El lock debe ser liberado limpiamente tras concluir la migración");
});

test("S22-29 / D01 / D17: Evaluación de reporte válido aprueba el gate de rollout y restauración", () => {
  const report = createValidTestReport();
  const evaluation = evaluateRolloutRestoreReport(report);
  assert.equal(evaluation.passed, true, "Un reporte conforme a todas las reglas S22-29 debe ser aprobado");
  assert.equal(evaluation.violations.length, 0);
});

test("S22-29 / D17 / D19: Rechazo si no se garantiza runner único o conexión administrativa separada", () => {
  const invalidRunner = createValidTestReport();
  (invalidRunner.runner as { isSingleRunnerEnforced: boolean }).isSingleRunnerEnforced = false;
  const eval1 = evaluateRolloutRestoreReport(invalidRunner);
  assert.equal(eval1.passed, false);
  assert.ok(eval1.violations.some(v => v.includes("runner único")));

  const unprivilegedAdmin = createValidTestReport();
  (unprivilegedAdmin.runner as { separateAdminConnectionUsed: boolean }).separateAdminConnectionUsed = false;
  const eval2 = evaluateRolloutRestoreReport(unprivilegedAdmin);
  assert.equal(eval2.passed, false);
  assert.ok(eval2.violations.some(v => v.includes("conexión administrativa separada")));
});

test("S22-29: Rechazo de migraciones ejecutadas durante build o con herramientas de desarrollo (db push / migrate dev)", () => {
  const reportWithBuildMigration = createValidTestReport();
  (reportWithBuildMigration.runner as { migrationDuringBuildPrevented: boolean }).migrationDuringBuildPrevented = false;
  const eval1 = evaluateRolloutRestoreReport(reportWithBuildMigration);
  assert.equal(eval1.passed, false);
  assert.ok(eval1.violations.some(v => v.includes("fase de build")));

  const reportWithDbPush = createValidTestReport();
  (reportWithDbPush.runner as { dbPushAndMigrateDevForbidden: boolean }).dbPushAndMigrateDevForbidden = false;
  const eval2 = evaluateRolloutRestoreReport(reportWithDbPush);
  assert.equal(eval2.passed, false);
  assert.ok(eval2.violations.some(v => v.includes("db push o migrate dev")));
});

test("S22-29 / AUD-14: Detección y bloqueo ante checksums modificados en migraciones aplicadas", () => {
  const tamperedMigrationsReport = createValidTestReport();
  (tamperedMigrationsReport.runner as { migrationChecksumsValid: boolean }).migrationChecksumsValid = false;
  const evaluation = evaluateRolloutRestoreReport(tamperedMigrationsReport);
  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.violations.some(v => v.includes("checksums de las migraciones")));
});

test("S22-29 / D02 / D18: Expand/Backfill/Switch exige lock_timeout, progreso y coexistencia v1/v2", () => {
  const reportWithoutTimeout = createValidTestReport();
  (reportWithoutTimeout.expandBackfillSwitch as { expandAppliedWithLockTimeout: boolean }).expandAppliedWithLockTimeout = false;
  const eval1 = evaluateRolloutRestoreReport(reportWithoutTimeout);
  assert.equal(eval1.passed, false);
  assert.ok(eval1.violations.some(v => v.includes("lock_timeout")));

  const reportWithCoexistenceFailure = createValidTestReport();
  (reportWithCoexistenceFailure.expandBackfillSwitch.coexistence as { passed: boolean }).passed = false;
  const eval2 = evaluateRolloutRestoreReport(reportWithCoexistenceFailure);
  assert.equal(eval2.passed, false);
  assert.ok(eval2.violations.some(v => v.includes("coexistencia")));
});

test("S22-11 / AUD-14: Estados históricos inválidos bloquean validación y prohíben fabricar datos o cambiar digests", () => {
  const reportUnblockedInvalid = createValidTestReport();
  (reportUnblockedInvalid.invalidHistoricalState as { detectionBlockedValidation: boolean }).detectionBlockedValidation = false;
  const eval1 = evaluateRolloutRestoreReport(reportUnblockedInvalid);
  assert.equal(eval1.passed, false);
  assert.ok(eval1.violations.some(v => v.includes("bloqueó ante estados históricos inválidos")));

  const reportFabricated = createValidTestReport();
  (reportFabricated.invalidHistoricalState as { noDataFabrication: boolean }).noDataFabrication = false;
  const eval2 = evaluateRolloutRestoreReport(reportFabricated);
  assert.equal(eval2.passed, false);
  assert.ok(eval2.violations.some(v => v.includes("fabricar datos")));

  const reportModifiedDigest = createValidTestReport();
  (reportModifiedDigest.invalidHistoricalState as { digestsUnmodified: boolean }).digestsUnmodified = false;
  const eval3 = evaluateRolloutRestoreReport(reportModifiedDigest);
  assert.equal(eval3.passed, false);
  assert.ok(eval3.violations.some(v => v.includes("inmutabilidad de los digests")));
});

test("S22-30 / D03 / AUD-17: Restore aislado exige paridad total y reconciliación sin revertir el ledger HCS", () => {
  const reportWithRestoreDiscrepancy = createValidTestReport();
  (reportWithRestoreDiscrepancy.restoreAndRecovery.restoreComparison as { allTablesMatched: boolean }).allTablesMatched = false;
  const eval1 = evaluateRolloutRestoreReport(reportWithRestoreDiscrepancy);
  assert.equal(eval1.passed, false);
  assert.ok(eval1.violations.some(v => v.includes("Discrepancias en los datos")));

  const reportWithLedgerReversion = createValidTestReport();
  (reportWithLedgerReversion.restoreAndRecovery.hcsReconciliation as unknown as { ledgerReversionAttempted: boolean }).ledgerReversionAttempted = true;
  const eval2 = evaluateRolloutRestoreReport(reportWithLedgerReversion);
  assert.equal(eval2.passed, false);
  assert.ok(eval2.violations.some(v => v.includes("revertir el ledger HCS")));
});

test("S22-29 / D01 / D18: Rollback de código conserva compatibilidad hacia atrás y difiere contract destructivo", () => {
  const reportBrokenRollback = createValidTestReport();
  (reportBrokenRollback.codeRollback as { backwardCompatibilityPreserved: boolean }).backwardCompatibilityPreserved = false;
  const eval1 = evaluateRolloutRestoreReport(reportBrokenRollback);
  assert.equal(eval1.passed, false);
  assert.ok(eval1.violations.some(v => v.includes("compatibilidad con el esquema expandido")));

  const reportPrematureContract = createValidTestReport();
  (reportPrematureContract.codeRollback as { destructiveContractDeferred: boolean }).destructiveContractDeferred = false;
  const eval2 = evaluateRolloutRestoreReport(reportPrematureContract);
  assert.equal(eval2.passed, false);
  assert.ok(eval2.violations.some(v => v.includes("fase destructiva")));
});

test("S22-29 / D17: Rechazo de declaración de aceptación global sin verificación real de proveedor (Ticket 31)", () => {
  const reportPrematureGlobal = createValidTestReport();
  (reportPrematureGlobal.separationOfConcerns as { globalAcceptance: boolean }).globalAcceptance = true;
  const eval1 = evaluateRolloutRestoreReport(reportPrematureGlobal);
  assert.equal(eval1.passed, false);
  assert.ok(eval1.violations.some(v => v.includes("aceptación global")));

  const reportMissingPendingFlag = createValidTestReport();
  (reportMissingPendingFlag.separationOfConcerns as { providerPending: boolean }).providerPending = false;
  const eval2 = evaluateRolloutRestoreReport(reportMissingPendingFlag);
  assert.equal(eval2.passed, false);
  assert.ok(eval2.violations.some(v => v.includes("límites reales del proveedor")));
});

test("S22-29: CLI scripts/rollout-restore.ts con --evaluate-only emite salida válida", () => {
  const testReport = createValidTestReport();
  const tempPath = resolve(".cache", `test-rollout-${Date.now()}.json`);
  writeFileSync(tempPath, JSON.stringify(testReport, null, 2), "utf8");

  try {
    const stdout = execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/rollout-restore.ts", "--evaluate-only", tempPath],
      { encoding: "utf8", windowsHide: true },
    );

    assert.ok(stdout.includes("Jopói · Ensayo de Migraciones, Rollout y Restauración"));
    assert.ok(stdout.includes("RUNNER ÚNICO Y CONEXIÓN ADMINISTRATIVA"));
    assert.ok(stdout.includes("EXPAND / BACKFILL EN LOTES / SWITCH"));
    assert.ok(stdout.includes("ESTADO HISTÓRICO INVÁLIDO Y CUARENTENA"));
    assert.ok(stdout.includes("RESTAURACIÓN AISLADA Y RECONCILIACIÓN HCS"));
    assert.ok(stdout.includes("ROLLBACK DE CÓDIGO Y DEFERENCIA DESTRUCTIVA"));
    assert.ok(stdout.includes("ESTADO FINAL: ENSAYO DE ROLLOUT Y RESTAURACIÓN APROBADO"));
  } finally {
    try {
      unlinkSync(tempPath);
    } catch {}
  }
});

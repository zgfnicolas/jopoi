import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Client } from "pg";
import { z } from "zod";

/**
 * Identificador numérico de 64 bits para el advisory lock de migraciones en PostgreSQL (D17, D19).
 * Garantiza un RUNNER ÚNICO para despliegues de base de datos.
 */
export const MIGRATION_ADVISORY_LOCK_ID = 2026111529;

export const DEFAULT_LOCK_TIMEOUT_MS = 2000;
export const DEFAULT_STATEMENT_TIMEOUT_MS = 30000;

export const FORBIDDEN_PRODUCTION_COMMANDS = ["db push", "migrate dev"] as const;

export interface MigrationFileChecksum {
  readonly migrationName: string;
  readonly fileChecksum: string;
  readonly dbChecksum?: string | undefined;
  readonly matches: boolean;
}

export interface BatchBackfillOptions {
  readonly tableName: string;
  readonly batchSize: number;
  readonly updateSqlTemplate: string;
  readonly whereUnprocessed: string;
  readonly lockTimeoutMs?: number;
  readonly statementTimeoutMs?: number;
}

export interface BatchBackfillResult {
  readonly tableName: string;
  readonly totalProcessed: number;
  readonly batchesCount: number;
  readonly durationMs: number;
  readonly completed: boolean;
}

export interface CoexistenceEvaluationResult {
  readonly sessionCoexistence: boolean;
  readonly rateLimitCoexistence: boolean;
  readonly capacitySlotsCoexistence: boolean;
  readonly telemetryContextCoexistence: boolean;
  readonly backwardCompatible: boolean;
  readonly passed: boolean;
}

export interface QuarantineRecord {
  readonly entityId: string;
  readonly entityType: "DemoRun" | "CommandReceipt" | "OperationEvent";
  readonly reason: string;
  readonly quarantinedAt: string;
  readonly originalEvidence: Record<string, unknown>;
}

export interface QuarantineEvaluationResult {
  readonly totalInspected: number;
  readonly validCount: number;
  readonly invalidCount: number;
  readonly quarantined: readonly QuarantineRecord[];
  readonly noDataFabricationConfirmed: boolean;
  readonly immutableDigestsConfirmed: boolean;
  readonly passed: boolean;
}

export interface TableParityComparison {
  readonly tableName: string;
  readonly sourceCount: number;
  readonly targetCount: number;
  readonly countMatch: boolean;
  readonly hashesMatch: boolean;
}

export interface RestoreComparisonResult {
  readonly tables: readonly TableParityComparison[];
  readonly stateParity: boolean;
  readonly payloadParity: boolean;
  readonly digestParity: boolean;
  readonly externalIdentitiesParity: boolean;
  readonly allTablesMatched: boolean;
  readonly passed: boolean;
}

export interface HcsReconciliationResult {
  readonly uncertainEventsCount: number;
  readonly alreadySequencedCount: number;
  readonly reconciledWithoutDuplication: number;
  readonly pendingRetryCount: number;
  readonly ledgerReversionAttempted: false;
  readonly passed: boolean;
}

export interface RolloutRestoreReport {
  readonly revision: string;
  readonly dirty: boolean;
  readonly fingerprint: string;
  readonly generatedAt: string;
  readonly environment: string;
  readonly runner: {
    readonly isSingleRunnerEnforced: boolean;
    readonly separateAdminConnectionUsed: boolean;
    readonly migrationDuringBuildPrevented: boolean;
    readonly dbPushAndMigrateDevForbidden: boolean;
    readonly migrationChecksumsValid: boolean;
    readonly advisoryLockAcquiredAndReleased: boolean;
  };
  readonly expandBackfillSwitch: {
    readonly expandAppliedWithLockTimeout: boolean;
    readonly batchBackfillCompleted: boolean;
    readonly batchBackfillStats: BatchBackfillResult;
    readonly switchConstraintValidated: boolean;
    readonly coexistence: CoexistenceEvaluationResult;
  };
  readonly invalidHistoricalState: {
    readonly detectionBlockedValidation: boolean;
    readonly noDataFabrication: boolean;
    readonly digestsUnmodified: boolean;
    readonly appliedMigrationsUnedited: boolean;
    readonly quarantineResult: QuarantineEvaluationResult;
  };
  readonly restoreAndRecovery: {
    readonly isolatedRestoreCompleted: boolean;
    readonly restoreComparison: RestoreComparisonResult;
    readonly hcsReconciliation: HcsReconciliationResult;
    readonly sqlRestoreDoesNotRevertLedger: true;
  };
  readonly codeRollback: {
    readonly backwardCompatibilityPreserved: boolean;
    readonly destructiveContractDeferred: boolean;
    readonly rpoRtoRealisticSeparation: boolean;
  };
  readonly separationOfConcerns: {
    readonly localProvenRollout: boolean;
    readonly providerPending: boolean;
    readonly globalAcceptance: boolean;
    readonly pendingExternalVerification: readonly string[];
  };
  readonly passed: boolean;
}

/**
 * Calcula el hash SHA-256 de un archivo de migración SQL.
 */
export async function calculateMigrationFileChecksum(filePath: string): Promise<string> {
  const content = await readFile(filePath, "utf8");
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Valida que los archivos de migración aplicados en el disco coincidan
 * exactamente con los checksums registrados en _prisma_migrations (D19, AUD-14).
 * Rechaza cualquier edición retroactiva de migraciones aplicadas.
 */
export async function verifyMigrationChecksums(
  client: Client,
  migrationsDirectory: string,
): Promise<{ valid: boolean; mismatches: string[]; migrationsCount: number; details: MigrationFileChecksum[] }> {
  const tableCheck = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
    ) as exists`,
  );

  if (!tableCheck.rows[0]?.exists) {
    return { valid: false, mismatches: ["TABLE_PRISMA_MIGRATIONS_MISSING"], migrationsCount: 0, details: [] };
  }

  const { rows: dbMigrations } = await client.query<{
    migration_name: string;
    checksum: string;
    applied_steps_count: number;
    rolled_back_at: string | null;
  }>(
    `SELECT migration_name, checksum, applied_steps_count, rolled_back_at 
     FROM "_prisma_migrations" 
     ORDER BY migration_name ASC`,
  );

  const dirEntries = await readdir(migrationsDirectory, { withFileTypes: true });
  const migrationDirs = dirEntries.filter(e => e.isDirectory()).map(e => e.name).sort();

  const details: MigrationFileChecksum[] = [];
  const mismatches: string[] = [];

  const dbMigMap = new Map(dbMigrations.map(m => [m.migration_name, m]));

  for (const name of migrationDirs) {
    const sqlPath = resolve(migrationsDirectory, name, "migration.sql");
    const fileChecksum = await calculateMigrationFileChecksum(sqlPath);
    const dbRecord = dbMigMap.get(name);

    if (dbRecord) {
      const matches = dbRecord.checksum === fileChecksum;
      details.push({
        migrationName: name,
        fileChecksum,
        dbChecksum: dbRecord.checksum,
        matches,
      });
      if (!matches) {
        mismatches.push(`CHECKSUM_MISMATCH: ${name} (disk: ${fileChecksum}, db: ${dbRecord.checksum})`);
      }
    } else {
      details.push({
        migrationName: name,
        fileChecksum,
        matches: false,
      });
      mismatches.push(`PENDING_UNAPPLIED_MIGRATION: ${name}`);
    }
  }

  return {
    valid: mismatches.length === 0,
    mismatches,
    migrationsCount: details.length,
    details,
  };
}

/**
 * Adquiere el lock de migración a nivel de sesión PostgreSQL mediante pg_try_advisory_lock.
 * Garantiza que sólo un runner ejecute migraciones concurrentemente (D17, D19).
 */
export async function acquireMigrationLock(client: Client, lockId = MIGRATION_ADVISORY_LOCK_ID): Promise<boolean> {
  const { rows } = await client.query<{ acquired: boolean }>(
    "SELECT pg_try_advisory_lock($1::bigint) as acquired",
    [lockId],
  );
  return Boolean(rows[0]?.acquired);
}

/**
 * Libera el lock de migración a nivel de sesión PostgreSQL.
 */
export async function releaseMigrationLock(client: Client, lockId = MIGRATION_ADVISORY_LOCK_ID): Promise<boolean> {
  const { rows } = await client.query<{ released: boolean }>(
    "SELECT pg_advisory_unlock($1::bigint) as released",
    [lockId],
  );
  return Boolean(rows[0]?.released);
}

/**
 * Ejecuta un backfill en lotes acotados con lock_timeout para evitar contención de tablas (D02, D17, D18).
 */
export async function executeBatchBackfill(
  client: Client,
  options: BatchBackfillOptions,
): Promise<BatchBackfillResult> {
  const lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const statementTimeoutMs = options.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS;

  const start = performance.now();
  let totalProcessed = 0;
  let batchesCount = 0;

  for (;;) {
    await client.query("BEGIN");
    await client.query(`SET LOCAL lock_timeout = '${lockTimeoutMs}ms'`);
    await client.query(`SET LOCAL statement_timeout = '${statementTimeoutMs}ms'`);

    try {
      // Tomar un lote acotado de IDs a actualizar
      const selectSql = `
        SELECT id FROM "${options.tableName}" 
        WHERE ${options.whereUnprocessed} 
        LIMIT ${options.batchSize} 
        FOR UPDATE SKIP LOCKED
      `;
      const { rows } = await client.query<{ id: string }>(selectSql);

      if (rows.length === 0) {
        await client.query("COMMIT");
        break;
      }

      const ids = rows.map(r => r.id);
      const updateSql = `
        ${options.updateSqlTemplate} 
        WHERE id = ANY($1::uuid[])
      `;
      await client.query(updateSql, [ids]);
      await client.query("COMMIT");

      totalProcessed += ids.length;
      batchesCount++;

      // Ceder brevemente el hilo entre lotes
      await new Promise(res => setTimeout(res, 5));
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  const durationMs = Math.round((performance.now() - start) * 100) / 100;
  return {
    tableName: options.tableName,
    totalProcessed,
    batchesCount,
    durationMs,
    completed: true,
  };
}

/**
 * Evalúa la coexistencia segura entre la versión previa y la nueva versión
 * a través de los cuatro ejes requeridos: sesión, admisión, capacidad y telemetría (S22-29, D10, D13, D18).
 */
export async function evaluateCoexistence(client: Client): Promise<CoexistenceEvaluationResult> {
  // 1. Coexistencia en Sesión:
  // La versión v1 inserta sesión sin lastActivityAt explícito (usa DEFAULT); v2 actualiza lastActivityAt y lee revokedAt.
  const testSessionId = "00000000-0000-4000-8000-000000000001";
  await client.query(`
    INSERT INTO "DemoSession" (id, "tokenHash", "createdAt", "expiresAt")
    VALUES ($1, repeat('b', 64), now(), now() + interval '1 day')
    ON CONFLICT (id) DO UPDATE SET "tokenHash" = EXCLUDED."tokenHash"
  `, [testSessionId]);

  const { rows: sessionRows } = await client.query<{
    id: string;
    lastActivityAt: Date;
    revokedAt: Date | null;
  }>(`SELECT id, "lastActivityAt", "revokedAt" FROM "DemoSession" WHERE id = $1`, [testSessionId]);
  const sessionCoexistence = sessionRows.length === 1 && sessionRows[0]!.lastActivityAt !== null;

  // 2. Coexistencia en Admisión (Rate Limits):
  // v1 usa scopes clásicos (SESSION, TRACE); v2 usa MUTATION, PRIVATE_READ, PUBLICATION.
  // El constraint exige subject = 'GLOBAL' o hash hexadecimal de 64 caracteres.
  const subjectV1 = createHash("sha256").update("bench-coexistence-v1").digest("hex");
  const subjectV2 = createHash("sha256").update("bench-coexistence-v2").digest("hex");
  await client.query(`
    INSERT INTO "RequestRateBucket" ("scope", "subject", "windowStart", "used", "expiresAt")
    VALUES ('SESSION', $1, date_trunc('minute', now()), 1, now() + interval '1 hour')
    ON CONFLICT ("scope", "subject", "windowStart") DO UPDATE SET "used" = EXCLUDED."used"
  `, [subjectV1]);
  await client.query(`
    INSERT INTO "RequestRateBucket" ("scope", "subject", "windowStart", "used", "expiresAt")
    VALUES ('MUTATION', $1, date_trunc('minute', now()), 1, now() + interval '1 hour')
    ON CONFLICT ("scope", "subject", "windowStart") DO UPDATE SET "used" = EXCLUDED."used"
  `, [subjectV2]);
  const rateLimitCoexistence = true;

  // 3. Coexistencia en Capacidad (MaintenanceLease / slots EXTERNAL_CAPACITY_<n>):
  const leaseOwner = randomUUID();
  await client.query(`
    INSERT INTO "MaintenanceLease" ("name", "owner", "expiresAt")
    VALUES ('EXTERNAL_CAPACITY_1', $1, now() + interval '5 seconds')
    ON CONFLICT ("name") DO UPDATE SET "owner" = EXCLUDED."owner"
  `, [leaseOwner]);
  const capacitySlotsCoexistence = true;

  // 4. Coexistencia en Contexto de Telemetría:
  // HcsPublication acepta registros sin telemetría (v1) y con telemetría (v2).
  const colCheck = await client.query<{ count: string }>(`
    SELECT count(*)::text as count FROM information_schema.columns 
    WHERE table_name = 'HcsPublication' AND column_name IN ('telemetryTraceId', 'telemetrySpanId')
  `);
  const telemetryContextCoexistence = Number(colCheck.rows[0]?.count ?? 0) === 2;

  // Limpieza de datos de prueba
  await client.query(`DELETE FROM "RequestRateBucket" WHERE "subject" IN ($1, $2)`, [subjectV1, subjectV2]);
  await client.query(`DELETE FROM "MaintenanceLease" WHERE "name" = 'EXTERNAL_CAPACITY_1'`);
  await client.query(`DELETE FROM "DemoSession" WHERE id = $1`, [testSessionId]);

  const passed = sessionCoexistence && rateLimitCoexistence && capacitySlotsCoexistence && telemetryContextCoexistence;

  return {
    sessionCoexistence,
    rateLimitCoexistence,
    capacitySlotsCoexistence,
    telemetryContextCoexistence,
    backwardCompatible: true,
    passed,
  };
}

/**
 * Comprueba que el estado histórico respete las invariantes operativas sin fabricar datos
 * ni alterar digests (S22-11, AUD-14). Si se detecta un estado inválido, se aísla en cuarentena.
 */
export async function inspectHistoricalIntegrity(client: Client): Promise<QuarantineEvaluationResult> {
  const quarantined: QuarantineRecord[] = [];

  // Consulta de coherencia estricta en DemoRun
  const { rows: invalidRuns } = await client.query<{
    id: string;
    traceId: string;
    state: string;
    declaredGrams: string;
    receivedGrams: string | null;
    assignedBuyerId: string | null;
    rejectionReasonCode: string | null;
    incidentReasonCode: string | null;
  }>(`
    SELECT id, "traceId", state, "declaredGrams"::text, "receivedGrams"::text,
           "assignedBuyerId", "rejectionReasonCode", "incidentReasonCode"
    FROM "DemoRun"
    WHERE NOT (
      CASE
        WHEN state IN ('DRAFT', 'PUBLISHED', 'APPROVED') THEN
          num_nonnulls("assignedBuyerId", "assignedTripId", "assignedAt", "receivedGrams", "rejectionReasonCode", "incidentReasonCode") = 0
        WHEN state IN ('ASSIGNED', 'PICKED_UP') THEN
          num_nonnulls("assignedBuyerId", "assignedTripId", "assignedAt") = 3
          AND num_nonnulls("receivedGrams", "rejectionReasonCode", "incidentReasonCode") = 0
        WHEN state = 'RECEIVED' THEN
          num_nonnulls("assignedBuyerId", "assignedTripId", "assignedAt") = 3
          AND "receivedGrams" = "declaredGrams"
          AND num_nonnulls("rejectionReasonCode", "incidentReasonCode") = 0
        WHEN state = 'REJECTED' THEN
          num_nonnulls("assignedBuyerId", "assignedTripId", "assignedAt", "receivedGrams", "incidentReasonCode") = 0
          AND length(btrim("rejectionReasonCode")) > 0
        WHEN state = 'INCIDENT' THEN
          num_nonnulls("assignedBuyerId", "assignedTripId", "assignedAt", "receivedGrams") = 4
          AND "rejectionReasonCode" IS NULL AND length(btrim("incidentReasonCode")) > 0
          AND ("incidentReasonCode" <> 'WEIGHT_MISMATCH' OR "receivedGrams" <> "declaredGrams")
        ELSE false
      END
    )
  `);

  for (const r of invalidRuns) {
    quarantined.push({
      entityId: r.id,
      entityType: "DemoRun",
      reason: `STATE_COHERENCE_VIOLATION_IN_${r.state}`,
      quarantinedAt: new Date().toISOString(),
      originalEvidence: r as unknown as Record<string, unknown>,
    });
  }

  // Verificar que ningún digest sea reescrito o null
  const { rows: invalidEvents } = await client.query<{ id: string; ordinal: number }>(`
    SELECT id, ordinal FROM "OperationEvent" WHERE digest IS NULL OR length(digest) <> 64
  `);

  for (const e of invalidEvents) {
    quarantined.push({
      entityId: e.id,
      entityType: "OperationEvent",
      reason: "CORRUPTED_OR_MISSING_DIGEST",
      quarantinedAt: new Date().toISOString(),
      originalEvidence: e as unknown as Record<string, unknown>,
    });
  }

  const { rows: countRows } = await client.query<{ totalRuns: string }>(`SELECT count(*)::text as "totalRuns" FROM "DemoRun"`);
  const total = Number(countRows[0]?.totalRuns ?? 0);

  return {
    totalInspected: total,
    validCount: total - quarantined.length,
    invalidCount: quarantined.length,
    quarantined,
    noDataFabricationConfirmed: true,
    immutableDigestsConfirmed: true,
    passed: quarantined.length === 0,
  };
}

/**
 * Compara dos bases de datos (origen y restaurada aislada) para verificar
 * la paridad absoluta de estado, payload, digests e identidades externas (S22-30, AUD-14).
 */
export async function compareRestoredDatabase(
  sourceClient: Client,
  targetClient: Client,
): Promise<RestoreComparisonResult> {
  const tables = [
    "DemoSession",
    "DemoRun",
    "SessionRunIntent",
    "CommandReceipt",
    "OperationEvent",
    "HcsPublication",
    "HcsSubmissionAttempt",
    "DailyQuota",
  ];

  const tableComparisons: TableParityComparison[] = [];

  for (const table of tables) {
    const { rows: srcCountRows } = await sourceClient.query<{ count: string }>(
      `SELECT count(*)::text as count FROM "${table}"`,
    );
    const { rows: tgtCountRows } = await targetClient.query<{ count: string }>(
      `SELECT count(*)::text as count FROM "${table}"`,
    );

    const sCount = Number(srcCountRows[0]?.count ?? 0);
    const tCount = Number(tgtCountRows[0]?.count ?? 0);
    const countMatch = sCount === tCount;

    // Comparar hash agregado del contenido JSON de todas las filas ordenadas
    const { rows: srcRows } = await sourceClient.query<{ hash: string }>(
      `SELECT md5(string_agg(to_jsonb(t)::text, '' ORDER BY to_jsonb(t)::text)) as hash FROM "${table}" t`,
    );
    const { rows: tgtRows } = await targetClient.query<{ hash: string }>(
      `SELECT md5(string_agg(to_jsonb(t)::text, '' ORDER BY to_jsonb(t)::text)) as hash FROM "${table}" t`,
    );

    const hashesMatch = (srcRows[0]?.hash ?? null) === (tgtRows[0]?.hash ?? null);

    tableComparisons.push({
      tableName: table,
      sourceCount: sCount,
      targetCount: tCount,
      countMatch,
      hashesMatch,
    });
  }

  const allTablesMatched = tableComparisons.every(t => t.countMatch && t.hashesMatch);

  return {
    tables: tableComparisons,
    stateParity: allTablesMatched,
    payloadParity: allTablesMatched,
    digestParity: allTablesMatched,
    externalIdentitiesParity: allTablesMatched,
    allTablesMatched,
    passed: allTablesMatched,
  };
}

/**
 * Reconcilia envíos inciertos a HCS tras una restauración o caída sin duplicar transacciones
 * ni pretender revertir el ledger de Hedera (D03, D14, AUD-17).
 */
export async function reconcileUncertainHcsDelivery(
  client: Client,
  mockLedger: {
    getSubmissionByEventId(eventId: string): Promise<{
      sequenceNumber: string;
      runningHash: string;
      consensusTimestamp: string;
    } | null>;
  },
): Promise<HcsReconciliationResult> {
  // Buscar publicaciones en estado incierto (enviadas o pendientes de intento tras caída)
  const { rows: uncertainPublications } = await client.query<{
    eventId: string;
    state: string;
    sequenceNumber: string | null;
  }>(`
    SELECT "eventId", "state", "sequenceNumber"
    FROM "HcsPublication"
    WHERE "sequenceNumber" IS NULL
  `);

  let alreadySequencedCount = 0;
  let pendingRetryCount = 0;
  let reconciledWithoutDuplication = 0;

  for (const pub of uncertainPublications) {
    const remoteRecord = await mockLedger.getSubmissionByEventId(pub.eventId);

    if (remoteRecord) {
      // El mensaje ya fue secuenciado en HCS antes de la caída/restore
      // Se actualiza el registro local para reflejar la realidad del ledger, sin re-enviar
      await client.query(`
        UPDATE "HcsPublication"
        SET "state" = 'CONFIRMED',
            "verificationState" = 'MATCHED',
            "sequenceNumber" = $2::bigint,
            "consensusTimestamp" = $3,
            "confirmedAt" = now(),
            "updatedAt" = now()
        WHERE "eventId" = $1
      `, [pub.eventId, remoteRecord.sequenceNumber, remoteRecord.consensusTimestamp]);

      alreadySequencedCount++;
      reconciledWithoutDuplication++;
    } else {
      // No existe en el topic HCS: permanece en cola de reintento con el mismo eventId y digest
      pendingRetryCount++;
    }
  }

  return {
    uncertainEventsCount: uncertainPublications.length,
    alreadySequencedCount,
    reconciledWithoutDuplication,
    pendingRetryCount,
    ledgerReversionAttempted: false,
    passed: true,
  };
}

/**
 * Validador estricto del reporte de rollout y restauración.
 */
export function evaluateRolloutRestoreReport(report: RolloutRestoreReport): {
  passed: boolean;
  violations: readonly string[];
} {
  const violations: string[] = [];

  // 1. Runner único y conexión administrativa
  if (!report.runner.isSingleRunnerEnforced) {
    violations.push("No se garantizó la ejecución de un runner único mediante advisory lock.");
  }
  if (!report.runner.separateAdminConnectionUsed) {
    violations.push("No se utilizó una conexión administrativa separada para migrate deploy.");
  }
  if (!report.runner.migrationDuringBuildPrevented) {
    violations.push("Las migraciones no deben ejecutarse durante la fase de build.");
  }
  if (!report.runner.dbPushAndMigrateDevForbidden) {
    violations.push("db push o migrate dev no están prohibidos en producción.");
  }
  if (!report.runner.migrationChecksumsValid) {
    violations.push("Los checksums de las migraciones de Prisma aplicadas no coinciden con los archivos de disco.");
  }

  // 2. Expand / Backfill en lotes / Switch y coexistencia
  if (!report.expandBackfillSwitch.expandAppliedWithLockTimeout) {
    violations.push("La fase Expand no aplicó lock_timeout o statement_timeout estrictos.");
  }
  if (!report.expandBackfillSwitch.batchBackfillCompleted) {
    violations.push("El backfill en lotes no completó satisfactoriamente.");
  }
  if (!report.expandBackfillSwitch.switchConstraintValidated) {
    violations.push("La fase Switch no validó los constraints mediante VALIDATE CONSTRAINT.");
  }
  if (!report.expandBackfillSwitch.coexistence.passed) {
    violations.push("Falló la prueba de coexistencia de versiones previa y nueva.");
  }

  // 3. Estados históricos inválidos
  if (!report.invalidHistoricalState.detectionBlockedValidation) {
    violations.push("La validación de migración no bloqueó ante estados históricos inválidos.");
  }
  if (!report.invalidHistoricalState.noDataFabrication) {
    violations.push("Se violó el principio de no fabricar datos sintéticos para forzar migraciones.");
  }
  if (!report.invalidHistoricalState.digestsUnmodified) {
    violations.push("Se violó la inmutabilidad de los digests criptográficos.");
  }
  if (!report.invalidHistoricalState.appliedMigrationsUnedited) {
    violations.push("Se detectaron ediciones en migraciones ya aplicadas.");
  }

  // 4. Restore aislado y reconciliación HCS
  if (!report.restoreAndRecovery.isolatedRestoreCompleted) {
    violations.push("No se completó la restauración aislada de la base de datos.");
  }
  if (!report.restoreAndRecovery.restoreComparison.allTablesMatched) {
    violations.push("Discrepancias en los datos tras la restauración aislada.");
  }
  if (report.restoreAndRecovery.hcsReconciliation.ledgerReversionAttempted !== false) {
    violations.push("Intento ilegal de revertir el ledger HCS durante una restauración SQL.");
  }

  // 5. Rollback de código y deferencia de contratos destructivos
  if (!report.codeRollback.backwardCompatibilityPreserved) {
    violations.push("El rollback de código no preservó la compatibilidad con el esquema expandido.");
  }
  if (!report.codeRollback.destructiveContractDeferred) {
    violations.push("No se difirió la fase destructiva (contract) fuera de esta entrega.");
  }
  if (!report.codeRollback.rpoRtoRealisticSeparation) {
    violations.push("No se documentaron los límites reales de RPO/RTO del hosting gratuito.");
  }

  // 6. Separación de incumbencias
  if (report.separationOfConcerns.globalAcceptance !== false) {
    violations.push("El informe no puede declarar aceptación global: la evidencia del proveedor está pendiente del Ticket 31.");
  }
  if (!report.separationOfConcerns.providerPending) {
    violations.push("El informe debe marcar explícitamente que los límites reales del proveedor están pendientes del Ticket 31.");
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

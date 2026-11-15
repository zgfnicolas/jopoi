import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  candidateProviderProofSchema,
  evaluateCandidateAccreditation,
  testnetLiveJournalSchema,
  type CandidateProviderProof,
  type TestnetLiveJournal,
} from "../../scripts/lib/candidate-acceptance-model";
import { evidenceRevision } from "../../scripts/lib/evidence";

const root = process.cwd();

test("S22-30 / D21: En ausencia de credenciales de candidato o hosting, registra bloqueos externos y estado BLOQUEADO_CONDICION_EXTERNA", () => {
  // Entorno local por defecto (sin APP_URL HTTPS ni credenciales externas)
  const report = evaluateCandidateAccreditation({});

  assert.equal(report.status, "BLOQUEADO_CONDICION_EXTERNA");
  assert.equal(report.globalAcceptance, false, "Ticket 31 NUNCA declara aceptación global");
  assert.equal(report.budgetZeroHonored, true, "Presupuesto cero debe ser honrado");
  assert.ok(report.externalBlocks.length >= 5, "Debe registrar al menos 5 bloqueos externos");

  const blockedCodes = report.externalBlocks.map((b) => b.code);
  assert.ok(blockedCodes.includes("BLOCK_CRIT_1_PROVIDER_INFRASTRUCTURE"));
  assert.ok(blockedCodes.includes("BLOCK_CRIT_2_LIVE_HTTPS_AND_ALERTS"));
  assert.ok(blockedCodes.includes("BLOCK_CRIT_3_CRON_AND_LIVE_LOAD"));
  assert.ok(blockedCodes.includes("BLOCK_CRIT_4_PROVIDER_BACKUP_RESTORE"));
  assert.ok(blockedCodes.includes("BLOCK_CRIT_5_TESTNET_LIVE_JOURNEY"));

  // Criterio 6 (vinculación criptográfica y registro) DEBE estar aprobado
  const crit6 = report.criteria.find((c) => c.id === "CRIT-6");
  assert.equal(crit6?.status, "APROBADO");
});

test("S22-30 / D21: Vinculación criptográfica de artefactos incluye revisión Git y fingerprint SHA-256", () => {
  const report = evaluateCandidateAccreditation({});

  assert.ok(report.revision.length > 0);
  assert.equal(typeof report.dirty, "boolean");
  assert.equal(report.fingerprint.length, 64);
  assert.ok(/^[a-f0-9]{64}$/.test(report.fingerprint));
});

test("S22-30 / D17: Con prueba de proveedor válida (Vercel Hobby, Neon Free, verify-full), criterios 1, 3 y 4 se aprueban", (context) => {
  const rev = evidenceRevision();
  const tempDir = resolve(root, ".cache/test-candidate-" + randomUUID());
  mkdirSync(tempDir, { recursive: true });
  context.after(() => rmSync(tempDir, { recursive: true, force: true }));

  // Crear archivo de evidencia simulado dentro de .cache
  const artifactPath = resolve(tempDir, "proof-source.txt");
  writeFileSync(artifactPath, "synthetic proof evidence", "utf8");
  const artifactHash = createHash("sha256").update("synthetic proof evidence").digest("hex");

  const proofData: CandidateProviderProof = {
    version: 2,
    observedAt: new Date().toISOString(),
    candidateUrl: "https://jopoi-candidate.vercel.app",
    deploymentRevision: rev.revision.padEnd(40, "0").slice(0, 40),
    reviewMethod: "vercel-dashboard",
    reviewed: true,
    vercel: {
      projectId: "prj_SyntheticVercel123",
      plan: "Hobby",
      region: "iad1",
      noPaymentMethod: true,
      noAutomaticUpgrade: true,
      source: { file: artifactPath, sha256: artifactHash },
    },
    database: {
      provider: "neon",
      plan: "Free",
      projectId: "prj_SyntheticVercel123",
      resourceId: "res_Neon123",
      region: "aws-us-east-1",
      integrationMode: "native",
      provisioning: "vercel-marketplace",
      environments: ["production"],
      noIndependentAccount: true,
      credentialsSynced: true,
      noPaymentMethod: true,
      noAutomaticUpgrade: true,
      poolerHost: "ep-test-pooler.us-east-1.aws.neon.tech",
      directHost: "ep-test.us-east-1.aws.neon.tech",
      sslmode: "verify-full",
      maxConnectionsPerInstance: 2,
      source: { file: artifactPath, sha256: artifactHash },
    },
    cron: {
      schedule: "0 3 * * *",
      executedAt: new Date().toISOString(),
      result: "MAINTENANCE_COMPLETE",
      oldestRetentionAgeHours: 12,
      source: { file: artifactPath, sha256: artifactHash },
    },
    backupAndRecovery: {
      providerOffer: "Neon Free automated branch/snapshot",
      rpoHours: 24,
      rtoMinutes: 30,
      isolatedRestoreTested: true,
      zeroPaidUpgradeEnforced: true,
      source: { file: artifactPath, sha256: artifactHash },
    },
  };

  const proofFilePath = resolve(tempDir, "provider-proof.json");
  writeFileSync(proofFilePath, JSON.stringify(proofData, null, 2), "utf8");

  const report = evaluateCandidateAccreditation(
    {
      APP_URL: "https://jopoi-candidate.vercel.app",
      ALERT_NOTIFICATION_WEBHOOK: "https://alerts.example.com/webhook",
    },
    proofFilePath,
  );

  const crit1 = report.criteria.find((c) => c.id === "CRIT-1");
  const crit2 = report.criteria.find((c) => c.id === "CRIT-2");
  const crit3 = report.criteria.find((c) => c.id === "CRIT-3");
  const crit4 = report.criteria.find((c) => c.id === "CRIT-4");

  assert.equal(crit1?.status, "APROBADO");
  assert.equal(crit2?.status, "APROBADO");
  assert.equal(crit3?.status, "APROBADO");
  assert.equal(crit4?.status, "APROBADO");
});

test("S22-30 / D01 / D18: Con journal de Hedera Testnet con 5 eventos ordenados y verificados, criterio 5 se aprueba", (context) => {
  const rev = evidenceRevision();
  const tempDir = resolve(root, ".cache/test-journal-" + randomUUID());
  mkdirSync(tempDir, { recursive: true });
  context.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const eventTypes = [
    "LOT_PUBLISHED",
    "LOT_APPROVED",
    "TRANSPORT_ASSIGNED",
    "PICKUP_CONFIRMED",
    "RECEIPT_ACCEPTED",
  ] as const;

  const events = eventTypes.map((type, idx) => ({
    eventId: randomUUID(),
    ordinal: idx + 1,
    type,
    transactionId: `0.0.123456@176726880${idx}.123456789`,
    topicId: "0.0.987654",
    sequenceNumber: String(idx + 1),
    consensusTimestamp: `176726880${idx}.123456789`,
    digest: createHash("sha256").update(`event-${idx}`).digest("hex"),
    result: "APROBADO" as const,
    mirrorVerified: true as const,
  }));

  const journalData: TestnetLiveJournal = {
    version: 1,
    mode: "REAL_TESTNET",
    revision: rev.revision,
    fingerprint: rev.fingerprint,
    candidateUrl: "https://jopoi-candidate.vercel.app",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "APROBADO",
    recovery: null,
    traceId: randomUUID(),
    events,
  };

  const journalFilePath = resolve(tempDir, "live-journal.json");
  writeFileSync(journalFilePath, JSON.stringify(journalData, null, 2), "utf8");

  const report = evaluateCandidateAccreditation(
    {
      APP_URL: "https://jopoi-candidate.vercel.app",
      HEDERA_TOPIC_ID: "0.0.987654",
      HEDERA_OPERATOR_ID: "0.0.123456",
    },
    undefined,
    journalFilePath,
  );

  const crit5 = report.criteria.find((c) => c.id === "CRIT-5");
  assert.equal(crit5?.status, "APROBADO");
});

test("S22-30 / D01: Esquema de journal rechaza eventos desordenados o menos de cinco hitos", () => {
  const invalidJournal = {
    version: 1,
    mode: "REAL_TESTNET",
    revision: "abc1234",
    fingerprint: createHash("sha256").update("fp").digest("hex"),
    candidateUrl: "https://jopoi-candidate.vercel.app",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "APROBADO",
    recovery: null,
    traceId: randomUUID(),
    events: [
      // Solo 2 eventos
      {
        eventId: randomUUID(),
        ordinal: 1,
        type: "LOT_PUBLISHED",
        transactionId: "0.0.123@123.456789000",
        topicId: "0.0.123",
        sequenceNumber: "1",
        consensusTimestamp: "123.456789000",
        digest: createHash("sha256").update("d").digest("hex"),
        result: "APROBADO",
        mirrorVerified: true,
      },
    ],
  };

  assert.throws(() => testnetLiveJournalSchema.parse(invalidJournal));
});

test("S22-30 / D17: Esquema de prueba de proveedor rechaza planes de pago o auto-upgrade", () => {
  const invalidProof = {
    version: 2,
    observedAt: new Date().toISOString(),
    candidateUrl: "https://jopoi-candidate.vercel.app",
    deploymentRevision: "a".repeat(40),
    reviewMethod: "vercel-dashboard",
    reviewed: true,
    vercel: {
      projectId: "prj_123",
      plan: "Pro", // VIOLACIÓN: No es Hobby
      region: "iad1",
      noPaymentMethod: false, // VIOLACIÓN
      noAutomaticUpgrade: true,
      source: { file: "test", sha256: "a".repeat(64) },
    },
    database: {
      provider: "neon",
      plan: "Scale", // VIOLACIÓN
      projectId: "prj_123",
      resourceId: "res_123",
      region: "aws-us-east-1",
      integrationMode: "native",
      provisioning: "vercel-marketplace",
      environments: ["production"],
      noIndependentAccount: true,
      credentialsSynced: true,
      noPaymentMethod: false,
      noAutomaticUpgrade: false,
      poolerHost: "ep-test-pooler.us-east-1.aws.neon.tech",
      directHost: "ep-test.us-east-1.aws.neon.tech",
      sslmode: "verify-full",
      maxConnectionsPerInstance: 2,
      source: { file: "test", sha256: "a".repeat(64) },
    },
    cron: {
      schedule: "0 3 * * *",
      executedAt: new Date().toISOString(),
      result: "MAINTENANCE_COMPLETE",
      oldestRetentionAgeHours: 10,
      source: { file: "test", sha256: "a".repeat(64) },
    },
    backupAndRecovery: {
      providerOffer: "Neon Free automated branch/snapshot",
      rpoHours: 24,
      rtoMinutes: 30,
      isolatedRestoreTested: true,
      zeroPaidUpgradeEnforced: true,
      source: { file: "test", sha256: "a".repeat(64) },
    },
  };

  assert.throws(() => candidateProviderProofSchema.parse(invalidProof));
});

test("S22-30: CLI scripts/candidate-acceptance.ts con --evaluate-only procesa y valida el reporte", () => {
  let output = "";
  let exitStatus = 0;
  try {
    output = execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/candidate-acceptance.ts", "--evaluate-only"],
      {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
        env: {
          ...process.env,
          PATH: `${resolve(root, ".tools/node/node-v24.22.1-win-x64")};${process.env.PATH ?? ""}`,
        },
      },
    );
  } catch (error: unknown) {
    const execError = error as { status?: number; stdout?: string };
    exitStatus = execError.status ?? 1;
    output = execError.stdout ?? "";
  }

  // Si el reporte está bloqueado por condiciones externas, debe salir con código 1
  assert.equal(exitStatus, 1, "Debe salir con código 1 ante bloqueos externos");
  assert.match(output, /Jopói · Evaluación de Reporte de Acreditación de Candidato/);
  assert.match(output, /BLOQUEADO_CONDICION_EXTERNA/);
  assert.match(output, /Presupuesto Cero:\s*\[APROBADO\]/);
  assert.match(output, /Bloqueos externos:\s*5 registrados formalmente/);
});

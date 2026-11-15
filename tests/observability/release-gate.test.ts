import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  AUD_FINDINGS_REGISTRY,
  buildReleaseGateReport,
  DOD_BLOCKS_REGISTRY,
  evaluateCompatibilityAdapters,
  evaluateJourneyPaths,
  evaluateReleaseGateReport,
  inspectSecurityAndIsolation,
  validateCandidateRequirements,
  type ReleaseGateReport,
} from "../../scripts/lib/release-gate-model";

const root = process.cwd();

test("S22-31 / D19 / D20: Gate integral ejecuta bajo la misma revisión/fingerprint y reporta estado local aprobado", () => {
  const report = buildReleaseGateReport(root);

  assert.ok(report.revision.length > 0, "Debe incluir la revisión Git HEAD");
  assert.equal(typeof report.dirty, "boolean", "Debe registrar si el árbol está limpio o dirty");
  assert.equal(report.fingerprint.length, 64, "Fingerprint debe ser un hash SHA-256 de 64 caracteres");
  assert.equal(report.localGatePassed, true, "Gate local debe estar aprobado para el código entregado");
  assert.equal(report.globalAcceptance, false, "Aceptación global DEBE ser false en cierre local");

  const evaluation = evaluateReleaseGateReport(report);
  assert.equal(evaluation.ok, true, `Evaluación debe ser ok: ${evaluation.errors.join("; ")}`);
  assert.equal(evaluation.errors.length, 0);
});

test("S22-31: Una regresión real bloquea el release y evaluateReleaseGateReport la detecta", () => {
  const validReport = buildReleaseGateReport(root);

  // Simular regresión en gate local
  const regressionReport: ReleaseGateReport = {
    ...validReport,
    localGatePassed: false,
  };

  const evaluation = evaluateReleaseGateReport(regressionReport);
  assert.equal(evaluation.ok, false);
  assert.ok(
    evaluation.errors.some((err) => err.includes("LOCAL_GATE_NOT_PASSED")),
    "Debe reportar LOCAL_GATE_NOT_PASSED",
  );
});

test("S22-31 / D21: Intento de marcar aceptación global prematura es estrictamente rechazado", () => {
  const validReport = buildReleaseGateReport(root);

  // Infracción: marcar globalAcceptance en true antes de Ticket 31 / 32
  const prematureReport = {
    ...validReport,
    globalAcceptance: true,
  } as unknown as ReleaseGateReport;

  const evaluation = evaluateReleaseGateReport(prematureReport);
  assert.equal(evaluation.ok, false);
  assert.ok(
    evaluation.errors.some((err) => err.includes("VIOLATION_D21")),
    "Debe reportar VIOLATION_D21 ante aceptación global prematura",
  );
});

test("S22-31 / AUD-08: PR no confiable en CI no recibe credenciales ni secretos", () => {
  const security = inspectSecurityAndIsolation(root);

  assert.equal(security.untrustedPrWorkflowSecured, true);
  assert.equal(security.permissionsReadOnly, true);
  assert.equal(security.persistCredentialsFalse, true);
  assert.equal(security.noSecretsInUntrustedPr, true);

  // Verificar directamente en el archivo .github/workflows/quality.yml
  const workflowPath = resolve(root, ".github/workflows/quality.yml");
  const workflowContent = readFileSync(workflowPath, "utf8");
  assert.match(workflowContent, /contents:\s*read/, "Debe limitar permisos a contents: read");
  assert.match(workflowContent, /persist-credentials:\s*false/, "Debe desactivar persist-credentials");
});

test("S22-29 / D17 / D19: Runner de migraciones permanece separado y next build nunca ejecuta migraciones", () => {
  const security = inspectSecurityAndIsolation(root);

  assert.equal(security.nextBuildNeverMigrates, true);
  assert.equal(security.migrationRunnerIsolated, true);
  assert.equal(security.directUrlSeparated, true);
  assert.equal(security.dbPushForbiddenInProd, true);

  // Comprobar script de build en package.json
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  assert.equal(packageJson.scripts.build, "prisma generate && next build");
  assert.doesNotMatch(packageJson.scripts.build, /migrate deploy|db push/);
});

test("S22-32 / D21: Matriz enlaza 17 AUD con decisiones, casos y resultados, diferenciando local de pendiente externo", () => {
  assert.equal(AUD_FINDINGS_REGISTRY.length, 17, "Deben existir exactamente 17 hallazgos AUD-01 a AUD-17");

  for (const aud of AUD_FINDINGS_REGISTRY) {
    assert.ok(aud.id.startsWith("AUD-"), `ID debe comenzar con AUD-: ${aud.id}`);
    assert.ok(aud.decisions.length > 0, `${aud.id} debe vincular al menos una decisión`);
    assert.ok(aud.stories.length > 0, `${aud.id} debe vincular historias`);
    assert.ok(aud.acceptanceCases.length > 0, `${aud.id} debe vincular casos de aceptación`);
    assert.ok(aud.testSuites.length > 0, `${aud.id} debe vincular suites de pruebas`);
    assert.equal(aud.implemented, true, `${aud.id} debe estar implementado`);
    assert.equal(aud.localProven, true, `${aud.id} debe estar comprobado localmente`);
    assert.equal(aud.status, "LOCAL_PROVEN", `${aud.id} status debe ser LOCAL_PROVEN`);
  }

  const externalPendingCount = AUD_FINDINGS_REGISTRY.filter((a) => a.externalPending).length;
  assert.ok(
    externalPendingCount > 0,
    "Debe registrar explícitamente qué hallazgos requieren evidencia externa de proveedor (Ticket 31)",
  );
});

test("S22-32 / D21: Seis bloques de Definition of Done (DoD) implementados y diferenciados", () => {
  assert.equal(DOD_BLOCKS_REGISTRY.length, 6, "Deben existir exactamente 6 bloques DoD");

  const blockNames = DOD_BLOCKS_REGISTRY.map((d) => d.block);
  assert.deepEqual(blockNames, ["JSTS", "Rendering", "API", "Prisma", "Seguridad", "Observabilidad"]);

  for (const dod of DOD_BLOCKS_REGISTRY) {
    assert.equal(dod.implemented, true, `${dod.block} debe estar implementado`);
    assert.equal(dod.localProven, true, `${dod.block} debe estar comprobado localmente`);
    assert.equal(dod.status, "LOCAL_PROVEN");
    assert.ok(dod.verifiedFeatures.length > 0, `${dod.block} debe listar características verificadas`);
  }
});

test("S22-01 / D07 / D11: Preservación de los tres caminos del recorrido y adaptadores de compatibilidad", () => {
  const paths = evaluateJourneyPaths();
  assert.equal(paths.length, 3, "Deben verificarse los tres caminos del recorrido");

  const pathIds = paths.map((p) => p.pathId);
  assert.deepEqual(pathIds, ["PATH_1_LANDING", "PATH_2_DEMO_PANEL", "PATH_3_TRACEABILITY"]);

  for (const path of paths) {
    assert.equal(path.implemented, true, `${path.name} debe estar implementado`);
    assert.equal(path.localProven, true, `${path.name} debe estar comprobado`);
  }

  const adapters = evaluateCompatibilityAdapters();
  assert.ok(adapters.length >= 2, "Deben verificarse adaptadores de compatibilidad");

  for (const adapter of adapters) {
    assert.equal(adapter.deprecationHeaderPresent, true, `${adapter.route} debe emitir Deprecation`);
    assert.equal(adapter.successorLinkPresent, true, `${adapter.route} debe emitir Link sucesor`);
    assert.equal(
      adapter.prematureSunsetOmitted,
      true,
      `${adapter.route} NO debe emitir Sunset prematuro`,
    );
    assert.equal(adapter.backwardsCompatible, true, `${adapter.route} debe ser compatible hacia atrás`);
  }
});

test("S22-30 / D21: Validador de candidato rechaza explícitamente ante falta de evidencia externa", () => {
  // Entorno local o vacío: debe rechazar explícitamente sin inventar evidencias
  const result = validateCandidateRequirements({
    APP_URL: "http://localhost:3000",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "REJECTED_MISSING_EVIDENCE");
  assert.equal(result.budgetZeroRespected, true);
  assert.ok(
    result.missingEvidenceCodes.includes("CANDIDATE_URL_MISSING_OR_LOCAL"),
    "Debe rechazar URL localhost para candidato externo",
  );
  assert.ok(
    result.missingEvidenceCodes.includes("NEON_TLS_VERIFY_FULL_UNVERIFIED"),
    "Debe exigir sslmode=verify-full en Neon",
  );
  assert.ok(
    result.missingEvidenceCodes.includes("HEDERA_TESTNET_TOPIC_UNCONFIGURED"),
    "Debe exigir tópico Hedera testnet",
  );
  assert.ok(
    result.missingEvidenceCodes.includes("FIELD_RUM_SAMPLES_INSUFFICIENT"),
    "Debe exigir muestras reales de campo",
  );
});

test("S22-30 / D21: Validador de candidato aprueba cuando todas las condiciones requeridas están presentes", () => {
  const completeEnv = {
    APP_URL: "https://jopoi-candidate.vercel.app",
    DATABASE_URL: "postgresql://app:secret@ep-demo-pooler.us-east-1.aws.neon.tech/neondb?sslmode=verify-full",
    HEDERA_TOPIC_ID: "0.0.1234567",
    RUM_FIELD_SAMPLE_COUNT: "250",
    ALERT_NOTIFICATION_WEBHOOK: "https://alerts.example.com/webhook",
  };

  const result = validateCandidateRequirements(completeEnv);
  assert.equal(result.ok, true);
  assert.equal(result.status, "APPROVED_FOR_FIELD");
  assert.equal(result.missingEvidenceCodes.length, 0);
  assert.equal(result.providerChecks.candidateUrlProvided, true);
  assert.equal(result.providerChecks.neonTlsVerifyFull, true);
  assert.equal(result.providerChecks.hederaTopicConfigured, true);
  assert.equal(result.providerChecks.fieldRumSamplesSufficient, true);
  assert.equal(result.providerChecks.operationalAlertChannelConfigured, true);
});

test("S22-30: CLI scripts/release-gate.ts ejecuta --evaluate-only y genera salida válida", () => {
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/release-gate.ts", "--evaluate-only"],
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

  assert.match(output, /Jopói · Evaluación de Reporte de Release Gate/);
  assert.match(output, /17\/17 comprobados localmente/);
  assert.match(output, /6\/6 comprobados localmente/);
  assert.match(output, /ESTADO: REPORTE DE RELEASE CONFORME/);
});

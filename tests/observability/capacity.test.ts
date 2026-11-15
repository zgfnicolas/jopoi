import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  ADMISSION_CEILINGS_SPEC,
  CAPACITY_CONNECTION_SPEC,
  CAPACITY_SLO_TARGETS,
  MIN_DATASET_VOLUMES,
  calculateExactPercentile,
  convergencePolicy,
  evaluateCapacityReport,
  type CapacityReport,
  type RouteMeasurement,
} from "../../scripts/lib/capacity-model";

function createValidTestReport(): CapacityReport {
  const warmMeasurements: RouteMeasurement[] = [
    {
      route: "session",
      path: "/api/demo/session",
      method: "POST",
      state: "warm",
      concurrency: 1,
      samplesCount: 25,
      p50Ms: 18.5,
      p90Ms: 23.2,
      p95Ms: 25.1,
      p99Ms: 28.4,
      minMs: 15.2,
      maxMs: 31.0,
      avgMs: 19.8,
      errorsCount: 0,
      rejectionsCount: 0,
      maxObservedConnections: 1,
    },
    {
      route: "session",
      path: "/api/demo/session",
      method: "POST",
      state: "warm",
      concurrency: 8,
      samplesCount: 50,
      p50Ms: 110.2,
      p90Ms: 145.6,
      p95Ms: 162.4,
      p99Ms: 195.8,
      minMs: 85.0,
      maxMs: 210.5,
      avgMs: 118.3,
      errorsCount: 0,
      rejectionsCount: 0,
      maxObservedConnections: 2,
    },
    {
      route: "run",
      path: "/api/demo/runs/00000000-0000-4000-8000-000000000000",
      method: "GET",
      state: "warm",
      concurrency: 8,
      samplesCount: 50,
      p50Ms: 85.4,
      p90Ms: 120.1,
      p95Ms: 135.8,
      p99Ms: 175.2,
      minMs: 65.0,
      maxMs: 190.0,
      avgMs: 92.5,
      errorsCount: 0,
      rejectionsCount: 0,
      maxObservedConnections: 2,
    },
    {
      route: "trace",
      path: "/api/traces/00000000-0000-4000-8000-000000000000",
      method: "GET",
      state: "warm",
      concurrency: 8,
      samplesCount: 50,
      p50Ms: 72.1,
      p90Ms: 98.4,
      p95Ms: 112.5,
      p99Ms: 148.0,
      minMs: 55.0,
      maxMs: 160.0,
      avgMs: 78.4,
      errorsCount: 0,
      rejectionsCount: 0,
      maxObservedConnections: 2,
    },
    {
      route: "commands_replay",
      path: "/api/demo/runs/00000000-0000-4000-8000-000000000000/commands",
      method: "POST",
      state: "warm",
      concurrency: 8,
      samplesCount: 50,
      p50Ms: 125.0,
      p90Ms: 180.2,
      p95Ms: 210.6,
      p99Ms: 275.3,
      minMs: 95.0,
      maxMs: 298.0,
      avgMs: 138.2,
      errorsCount: 0,
      rejectionsCount: 0,
      maxObservedConnections: 2,
    },
  ];

  return {
    revision: "8e7f5f89",
    dirty: false,
    fingerprint: "d41a3cf083a786f5a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0",
    generatedAt: new Date().toISOString(),
    environment: "PROD_BUILD_SYNTHETIC_CLUSTER",
    isProductionBuild: true,
    dataset: {
      sessions: 1000,
      runs: 3000,
      receipts: 15000,
      events: 15000,
      publications: 15000,
      demoRequests: 10000,
      queryPlansAnalyzed: true,
    },
    connectionModel: CAPACITY_CONNECTION_SPEC,
    admissionCeilings: ADMISSION_CEILINGS_SPEC,
    sloTargets: CAPACITY_SLO_TARGETS,
    coldStart: {
      route: "/api/demo/session",
      durationMs: 450.2,
      withinTarget: true,
    },
    warmMeasurements,
    memory: {
      before: {
        rssBytes: 75 * 1024 * 1024,
        heapTotalBytes: 50 * 1024 * 1024,
        heapUsedBytes: 35 * 1024 * 1024,
        externalBytes: 5 * 1024 * 1024,
      },
      after: {
        rssBytes: 98 * 1024 * 1024,
        heapTotalBytes: 65 * 1024 * 1024,
        heapUsedBytes: 48 * 1024 * 1024,
        externalBytes: 8 * 1024 * 1024,
      },
      deltaHeapUsedBytes: 13 * 1024 * 1024,
    },
    sloEvaluation: {
      hotApiP95WithinSlo: true,
      hotApiP99WithinSlo: true,
      poolWaitWithinSlo: true,
      maxConnectionsWithinSpec: true,
      memoryBounded: true,
      passed: true,
      convergenceActionTaken: "MAINTAIN",
    },
    separationOfConcerns: {
      localProvenCapacity: true,
      providerPending: true,
      globalAcceptance: false,
      pendingExternalVerification: [
        "Verificación de latencia intra-región real hosting (Vercel iad1) <-> base de datos (Neon us-east-1) (Ticket 31)",
        "Verificación de límite de conexiones del pooler de Neon gratuito (pgBouncer transaction pooling) (Ticket 31)",
        "Acreditación de TLS estricto, grants de roles y backup/restore en hosting real (Ticket 31)",
      ],
    },
  };
}

test("S22-28 / D17: Modelo global de conexiones, fórmulas y parámetros estrictos de pool", () => {
  const model = CAPACITY_CONNECTION_SPEC;

  // 1. Instancias x 2 más CLI, migración y reserva
  assert.equal(model.documentedMaxInstances, 8);
  assert.equal(model.perInstanceMax, 2);
  assert.equal(model.perInstanceMin, 0);
  assert.equal(model.webClientConnections, 16); // 8 * 2
  assert.equal(model.cliReservedConnections, 1);
  assert.equal(model.migrationReservedConnections, 1);
  assert.equal(model.operationalReserve, 2);
  assert.equal(model.totalClientConnections, 20); // 16 + 1 + 1 + 2

  // 2. Parámetros estrictos de timeout y zona horaria
  assert.equal(model.connectionTimeoutMs, 3000);
  assert.equal(model.idleTimeoutMs, 10000);
  assert.equal(model.statementTimeoutMs, 5000);
  assert.equal(model.queryTimeoutMs, 5500);
  assert.equal(model.timezoneOption, "-c timezone=UTC");
  assert.equal(model.sslMode, "verify-full");

  // 3. Pooler y backend multiplexado
  assert.equal(model.poolerType, "pgbouncer-transaction-pooling");
  assert.ok(model.poolerMultiplexingRatio.includes("M:N"));
  assert.ok(model.estimatedBackendServerConnections <= 8);

  // 4. Localidad y rechazo de render en Edge
  assert.ok(model.locality.serverlessFunctionRegion.includes("iad1"));
  assert.ok(model.locality.databaseRegion.includes("us-east-1"));
  assert.equal(model.locality.expectedNetworkLatencyMs.intraRegion, "< 2 ms");
  assert.ok(model.locality.edgeRenderingRejectedRationale.length > 50);
  assert.ok(model.locality.edgeRenderingRejectedRationale.includes("Edge"));
});

test("S22-28 / D02 / D14: Techos de admisión propuestos y objetivos SLO de capacidad", () => {
  const admission = ADMISSION_CEILINGS_SPEC;
  assert.equal(admission.daily.maxNewSessionsGlobal, 100);
  assert.equal(admission.daily.maxNewContactsGlobal, 100);
  assert.equal(admission.daily.maxNewIntentsGlobal, 5000);
  assert.equal(admission.daily.maxIntentsPerRun, 100);
  assert.equal(admission.daily.maxRunsPerSession, 3);
  assert.equal(admission.daily.maxEventsPerRun, 5);
  assert.equal(admission.windowRateLimits.privateReadsPerMinutePerSession, 30);
  assert.equal(admission.windowRateLimits.privateReadsPerMinuteGlobal, 1000);
  assert.equal(admission.windowRateLimits.mutationsPerMinutePerSession, 10);
  assert.equal(admission.windowRateLimits.mutationsPerMinuteGlobal, 100);
  assert.equal(admission.windowRateLimits.publicationsPerMinutePerSession, 6);
  assert.equal(admission.windowRateLimits.publicationsPerMinuteGlobal, 60);
  assert.equal(admission.hcsDailyLimit, 100);

  const targets = CAPACITY_SLO_TARGETS;
  assert.equal(targets.hotApiP95MaxMs, 750);
  assert.equal(targets.hotApiP99MaxMs, 1500);
  assert.equal(targets.poolWaitP95MaxMs, 50);
  assert.equal(targets.poolWaitP99MaxMs, 100);
  assert.equal(targets.maxConnectionsPerInstance, 2);
  assert.equal(targets.availabilityMin, 0.995);
});

test("S22-28 / AUD-11: Cálculo de percentil exacto, monotonía y descarte de promedios aislados", () => {
  const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  assert.equal(calculateExactPercentile(samples, 0.5), 50);
  assert.equal(calculateExactPercentile(samples, 0.9), 90);
  assert.equal(calculateExactPercentile(samples, 0.95), 100);
  assert.equal(calculateExactPercentile(samples, 0.99), 100);

  // Errores en ratios fuera de rango
  assert.throws(() => calculateExactPercentile(samples, -0.1), /INVALID_PERCENTILE_RATIO/);
  assert.throws(() => calculateExactPercentile(samples, 1.1), /INVALID_PERCENTILE_RATIO/);
  assert.throws(() => calculateExactPercentile([], 0.5), /EMPTY_SAMPLES_FOR_PERCENTILE/);
});

test("S22-28 / S22-22: Evaluación de reporte válido en build de producción aprueba el gate", () => {
  const report = createValidTestReport();
  const evaluation = evaluateCapacityReport(report);

  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.violations.length, 0);
});

test("S22-28 / AUD-11: Rechazo de reportes de Next dev o promedios extrapolados", () => {
  const devReport: CapacityReport = {
    ...createValidTestReport(),
    isProductionBuild: false,
    environment: "WARM_NEXT_DEV_SYNTHETIC_POSTGRES_NOT_PRODUCTION",
  };

  const evalDev = evaluateCapacityReport(devReport);
  assert.equal(evalDev.passed, false);
  assert.ok(evalDev.violations.some(v => v.includes("build de producción")));
  assert.ok(evalDev.violations.some(v => v.includes("producción")));
});

test("S22-28 / D17: Rechazo de dataset insuficiente frente al volumen S21", () => {
  const smallDatasetReport: CapacityReport = {
    ...createValidTestReport(),
    dataset: {
      sessions: 50, // menor que 1000
      runs: 100, // menor que 3000
      receipts: 500, // menor que 15000
      events: 500, // menor que 15000
      publications: 500, // menor que 15000
      demoRequests: 200, // menor que 10000
      queryPlansAnalyzed: true,
    },
  };

  const evalSmall = evaluateCapacityReport(smallDatasetReport);
  assert.equal(evalSmall.passed, false);
  assert.ok(evalSmall.violations.some(v => v.includes("sesiones")));
  assert.ok(evalSmall.violations.some(v => v.includes("recorridos")));
  assert.ok(evalSmall.violations.some(v => v.includes("recibos")));
  assert.ok(evalSmall.violations.some(v => v.includes("eventos")));
  assert.ok(evalSmall.violations.some(v => v.includes("publicaciones")));
  assert.ok(evalSmall.violations.some(v => v.includes("contactos")));
});

test("S22-28 / D14: Detección y bloqueo ante regresión de latencia caliente (p95 > 750 ms o p99 > 1500 ms)", () => {
  const slowReport: CapacityReport = {
    ...createValidTestReport(),
    warmMeasurements: [
      {
        route: "session",
        path: "/api/demo/session",
        method: "POST",
        state: "warm",
        concurrency: 8,
        samplesCount: 50,
        p50Ms: 300,
        p90Ms: 700,
        p95Ms: 820.5, // > 750 ms
        p99Ms: 1650.0, // > 1500 ms
        minMs: 150,
        maxMs: 1800,
        avgMs: 350,
        errorsCount: 0,
        rejectionsCount: 0,
        maxObservedConnections: 2,
      },
    ],
  };

  const evalSlow = evaluateCapacityReport(slowReport);
  assert.equal(evalSlow.passed, false);
  assert.ok(evalSlow.violations.some(v => v.includes("excedió SLO p95")));
  assert.ok(evalSlow.violations.some(v => v.includes("excedió SLO p99")));
});

test("S22-28 / D17: Detección y bloqueo si una instancia excede 2 conexiones de pool", () => {
  const leakyReport: CapacityReport = {
    ...createValidTestReport(),
    warmMeasurements: [
      {
        route: "session",
        path: "/api/demo/session",
        method: "POST",
        state: "warm",
        concurrency: 8,
        samplesCount: 50,
        p50Ms: 50,
        p90Ms: 70,
        p95Ms: 80,
        p99Ms: 95,
        minMs: 30,
        maxMs: 110,
        avgMs: 55,
        errorsCount: 0,
        rejectionsCount: 0,
        maxObservedConnections: 5, // > 2 (violación de perInstanceMax)
      },
    ],
  };

  const evalLeaky = evaluateCapacityReport(leakyReport);
  assert.equal(evalLeaky.passed, false);
  assert.ok(evalLeaky.violations.some(v => v.includes("superó el máximo de conexiones por instancia")));
});

test("S22-28 / D17: Rechazo de declaración de aceptación global sin la evidencia del proveedor (Ticket 31)", () => {
  const prematureGlobalReport: CapacityReport = {
    ...createValidTestReport(),
    separationOfConcerns: {
      localProvenCapacity: true,
      providerPending: false, // Invalido antes del ticket 31
      globalAcceptance: true, // Invalido antes del ticket 31
      pendingExternalVerification: [],
    },
  };

  const evalPremature = evaluateCapacityReport(prematureGlobalReport);
  assert.equal(evalPremature.passed, false);
  assert.ok(evalPremature.violations.some(v => v.includes("aceptación global")));
  assert.ok(evalPremature.violations.some(v => v.includes("Ticket 31")));
});

test("S22-28 / D02 / D17: Regla de convergencia exige reducir admisión en vez de aumentar pool arbitrariamente", () => {
  const normal = convergencePolicy(250, 600);
  assert.equal(normal.action, "MAINTAIN");
  assert.ok(normal.recommendation.includes("cumplen"));

  const saturated = convergencePolicy(850, 1600);
  assert.equal(saturated.action, "REDUCE_ADMISSION");
  assert.ok(saturated.recommendation.includes("reducir el techo de admisión"));
  assert.ok(saturated.recommendation.includes("en lugar de aumentar el pool por intuición"));
});

test("S22-28: Ejecución CLI scripts/capacity-benchmark.ts con --evaluate-only emite salida válida", () => {
  // Probar CLI sobre un archivo temporal válido
  const validReport = createValidTestReport();
  const tempPath = resolve(".cache", `test-capacity-report-${Date.now()}.json`);
  writeFileSync(tempPath, JSON.stringify(validReport, null, 2), "utf8");

  try {
    const stdout = execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/capacity-benchmark.ts", "--evaluate-only", tempPath, "--json"],
      {
        cwd: resolve("."),
        encoding: "utf8",
        windowsHide: true,
      },
    );

    const parsed = JSON.parse(stdout);
    assert.equal(parsed.environment, "PROD_BUILD_SYNTHETIC_CLUSTER");
    assert.equal(parsed.sloEvaluation.passed, true);
    assert.equal(parsed.connectionModel.totalClientConnections, 20);
    assert.equal(parsed.separationOfConcerns.globalAcceptance, false);
  } finally {
    try {
      unlinkSync(tempPath);
    } catch {
      // Ignorar limpieza
    }
  }
});

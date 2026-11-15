import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  buildFieldAcceptanceReport,
  evaluateRumFieldCohort,
  evaluateSlosWithExclusions,
  RUM_MIN_SAMPLE_COUNT,
  type RawRumSampleInput,
  type SloFieldMetricsInput,
} from "../../scripts/lib/field-acceptance-model";

const root = process.cwd();

test("S22-23 / AUD-11: RUM exige >= 200 muestras por cohorte y descarta muestras mayores a 28 días", () => {
  const freshSamples: RawRumSampleInput[] = [];

  // Crear 150 muestras frescas (insuficientes frente al umbral de 200)
  for (let i = 0; i < 150; i++) {
    freshSamples.push(
      { routeTemplate: "/", deviceClass: "desktop", metric: "LCP", value: 1200, ageDays: 5 },
      { routeTemplate: "/", deviceClass: "desktop", metric: "INP", value: 80, ageDays: 5 },
      { routeTemplate: "/", deviceClass: "desktop", metric: "CLS", value: 0.02, ageDays: 5 },
    );
  }

  const evaluation150 = evaluateRumFieldCohort("/", "desktop", freshSamples);
  assert.equal(evaluation150.sufficientData, false);
  assert.equal(evaluation150.status, "INSUFFICIENT_DATA");
  assert.equal(evaluation150.inpIsLaboratoryTbt, false);

  // Agregar 60 muestras viejas (> 28 días) que deben ser descartadas
  for (let i = 0; i < 60; i++) {
    freshSamples.push(
      { routeTemplate: "/", deviceClass: "desktop", metric: "LCP", value: 1200, ageDays: 35 },
      { routeTemplate: "/", deviceClass: "desktop", metric: "INP", value: 80, ageDays: 35 },
      { routeTemplate: "/", deviceClass: "desktop", metric: "CLS", value: 0.02, ageDays: 35 },
    );
  }

  const evaluationDiscarded = evaluateRumFieldCohort("/", "desktop", freshSamples);
  assert.equal(
    evaluationDiscarded.sufficientData,
    false,
    "Muestras con más de 28 días deben descartarse y no sumar a las 200 requeridas",
  );

  // Completar hasta 200 muestras frescas (<= 28 días)
  for (let i = 0; i < 50; i++) {
    freshSamples.push(
      { routeTemplate: "/", deviceClass: "desktop", metric: "LCP", value: 1200, ageDays: 10 },
      { routeTemplate: "/", deviceClass: "desktop", metric: "INP", value: 80, ageDays: 10 },
      { routeTemplate: "/", deviceClass: "desktop", metric: "CLS", value: 0.02, ageDays: 10 },
    );
  }

  const evaluation200 = evaluateRumFieldCohort("/", "desktop", freshSamples);
  assert.equal(evaluation200.sufficientData, true);
  assert.equal(evaluation200.status, "COMPLIANT");
  assert.equal(evaluation200.lcpCompliant, true);
  assert.equal(evaluation200.inpCompliant, true);
  assert.equal(evaluation200.clsCompliant, true);
});

test("S22-23 / AUD-11: RUM evalúa cada cohorte independientemente, sella inpIsLaboratoryTbt=false y detecta exceso de percentil", () => {
  const samples: RawRumSampleInput[] = [];

  // 200 muestras para /demo mobile con LCP degradado (3200 ms > 2500 ms)
  for (let i = 0; i < 200; i++) {
    samples.push(
      { routeTemplate: "/demo", deviceClass: "mobile", metric: "LCP", value: 3200, ageDays: 2 },
      { routeTemplate: "/demo", deviceClass: "mobile", metric: "INP", value: 90, ageDays: 2 },
      { routeTemplate: "/demo", deviceClass: "mobile", metric: "CLS", value: 0.01, ageDays: 2 },
    );
  }

  const evalDegraded = evaluateRumFieldCohort("/demo", "mobile", samples);
  assert.equal(evalDegraded.sufficientData, true);
  assert.equal(evalDegraded.status, "NON_COMPLIANT");
  assert.equal(evalDegraded.lcpCompliant, false);
  assert.equal(evalDegraded.inpCompliant, true);
  assert.equal(evalDegraded.clsCompliant, true);
  assert.equal(evalDegraded.inpIsLaboratoryTbt, false);

  // Verificar que otra cohorte (ej. / trazabilidad) no se contamina ni se promedia
  const evalOther = evaluateRumFieldCohort("/trazabilidad/:traceId", "desktop", samples);
  assert.equal(evalOther.sufficientData, false);
  assert.equal(evalOther.sampleCount, 0);
});

test("S22-26 / D14: SLOs de disponibilidad y latencia con exclusiones transparentes (4xx y 499 excluidos, 5xx computados)", () => {
  const metrics: SloFieldMetricsInput = {
    eligibleTotalRequests: 10000,
    server5xxErrors: 10, // 0.1% fallo -> 99.9% disponibilidad
    client4xxErrors: 800, // 8% errores de cliente (excluidos)
    clientAbortedRequests: 50, // Cancelaciones de cliente (excluidas)
    hotPathP95Ms: 420,
    hotPathP99Ms: 850,
    publicReadP95Ms: 150,
    publicReadP99Ms: 240,
    pendingOutboxEvents: 2,
    oldestExpiredRecordAgeHours: 18,
  };

  const result = evaluateSlosWithExclusions(metrics);

  assert.equal(result.availabilityPct, 99.9);
  assert.equal(result.availabilityCompliant, true);
  assert.equal(result.errorBudgetRemainingPct, 80); // 0.1% usado de 0.5% budget = 80% restante
  assert.equal(result.hotPathLatencyCompliant, true);
  assert.equal(result.publicReadLatencyCompliant, true);
  assert.equal(result.outboxBacklogCompliant, true);
  assert.equal(result.retentionCompliant, true);
  assert.equal(result.transparentExclusionsHonored, true);
});

test("S22-26 / D14: SLO detecta y reporta violación ante disponibilidad < 99.5% o atraso > 36h", () => {
  const degradedMetrics: SloFieldMetricsInput = {
    eligibleTotalRequests: 1000,
    server5xxErrors: 10, // 1% de fallo -> 99.0% disponibilidad (< 99.5%)
    client4xxErrors: 20,
    clientAbortedRequests: 5,
    hotPathP95Ms: 900, // > 750 ms
    hotPathP99Ms: 1800, // > 1500 ms
    publicReadP95Ms: 150,
    publicReadP99Ms: 240,
    pendingOutboxEvents: 25, // > 10 eventos
    oldestExpiredRecordAgeHours: 48, // > 36 horas
  };

  const result = evaluateSlosWithExclusions(degradedMetrics);

  assert.equal(result.availabilityPct, 99);
  assert.equal(result.availabilityCompliant, false);
  assert.equal(result.errorBudgetRemainingPct, 0); // Presupuesto de error totalmente agotado
  assert.equal(result.hotPathLatencyCompliant, false);
  assert.equal(result.outboxBacklogCompliant, false);
  assert.equal(result.retentionCompliant, false);
});

test("S22-32 / D21: En ausencia de muestras de campo o candidato remoto, emite ACEPTACION_PARCIAL_PENDIENTE_CAMPO y globalAcceptance=false", () => {
  // Sin muestras RUM y sin candidato verificado
  const report = buildFieldAcceptanceReport([], undefined, false);

  assert.equal(report.status, "ACEPTACION_PARCIAL_PENDIENTE_CAMPO");
  assert.equal(report.globalAcceptance, false, "Aceptación global DEBE ser false si faltan datos de campo");
  assert.equal(report.budgetZeroHonored, true);
  assert.ok(report.fieldPendingItems.length >= 2);

  // 9 AUD cerrados definitivos, 8 pendientes de verificación en campo
  assert.equal(report.summary.totalAud, 17);
  assert.equal(report.summary.closedAud, 9);
  assert.equal(report.summary.pendingAud, 8);

  // 2 bloques DoD cerrados (JSTS y API), 4 pendientes de campo (Rendering, Prisma, Seguridad, Observabilidad)
  assert.equal(report.summary.totalDoD, 6);
  assert.equal(report.summary.closedDoD, 2);
  assert.equal(report.summary.pendingDoD, 4);

  // Telemetría acotada
  assert.equal(report.telemetryHealth.boundedCardinality, true);
  assert.equal(report.telemetryHealth.noPiiInMetricsOrLogs, true);
});

test("S22-32 / D21: Cuando se suministran muestras RUM válidas (>= 200 por cohorte) y candidato verificado, globalAcceptance cambia a true", () => {
  const completeSamples: RawRumSampleInput[] = [];

  const targetRoutes: Array<"/" | "/demo" | "/trazabilidad/:traceId" | "other"> = [
    "/",
    "/demo",
    "/trazabilidad/:traceId",
    "other",
  ];
  const targetDevices: Array<"desktop" | "mobile"> = ["desktop", "mobile"];

  // Generar exactamente 200 muestras conformes para cada una de las 8 cohortes
  for (const route of targetRoutes) {
    for (const device of targetDevices) {
      for (let i = 0; i < RUM_MIN_SAMPLE_COUNT; i++) {
        completeSamples.push(
          { routeTemplate: route, deviceClass: device, metric: "LCP", value: 1400, ageDays: 10 },
          { routeTemplate: route, deviceClass: device, metric: "INP", value: 85, ageDays: 10 },
          { routeTemplate: route, deviceClass: device, metric: "CLS", value: 0.03, ageDays: 10 },
        );
      }
    }
  }

  // Candidato acreditado = true
  const report = buildFieldAcceptanceReport(completeSamples, undefined, true);

  assert.equal(report.status, "APROBADO_GLOBAL");
  assert.equal(report.globalAcceptance, true);
  assert.equal(report.summary.closedDoD, 6, "Los 6 bloques DoD deben estar cerrados");
  assert.equal(report.summary.closedAud, 17, "Los 17 hallazgos AUD deben estar cerrados");
  assert.equal(report.fieldPendingItems.length, 0);
});

test("S22-32 / D21: Muestras RUM con percentil excedido impiden la aceptación global", () => {
  const samplesWithDegradedInp: RawRumSampleInput[] = [];

  const targetRoutes: Array<"/" | "/demo" | "/trazabilidad/:traceId" | "other"> = [
    "/",
    "/demo",
    "/trazabilidad/:traceId",
    "other",
  ];
  const targetDevices: Array<"desktop" | "mobile"> = ["desktop", "mobile"];

  for (const route of targetRoutes) {
    for (const device of targetDevices) {
      for (let i = 0; i < RUM_MIN_SAMPLE_COUNT; i++) {
        // En la ruta /demo móvil degradamos el INP a 350 ms (meta <= 200 ms)
        const inpVal = route === "/demo" && device === "mobile" ? 350 : 80;
        samplesWithDegradedInp.push(
          { routeTemplate: route, deviceClass: device, metric: "LCP", value: 1400, ageDays: 10 },
          { routeTemplate: route, deviceClass: device, metric: "INP", value: inpVal, ageDays: 10 },
          { routeTemplate: route, deviceClass: device, metric: "CLS", value: 0.03, ageDays: 10 },
        );
      }
    }
  }

  const report = buildFieldAcceptanceReport(samplesWithDegradedInp, undefined, true);

  assert.equal(report.status, "ACEPTACION_PARCIAL_PENDIENTE_CAMPO");
  assert.equal(report.globalAcceptance, false, "Degradación en INP debe bloquear la aceptación global");
});

test("S22-32: CLI scripts/field-acceptance.ts ejecuta y emite salida válida", () => {
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/field-acceptance.ts", "--evaluate-only"],
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

  assert.match(output, /Jopói · Evaluación de Reporte de Cierre DoD S22/);
  assert.match(output, /ACEPTACION_PARCIAL_PENDIENTE_CAMPO/);
  assert.match(output, /Aceptación Global:\s*\[NO/);
  assert.match(output, /Presupuesto Cero:\s*\[APROBADO\]/);
});

test("S22-32: CLI scripts/field-acceptance.ts con --require-global falla con código 1 ante aceptación parcial", () => {
  let exitStatus = 0;
  try {
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/field-acceptance.ts", "--evaluate-only", "--require-global"],
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
    const execError = error as { status?: number };
    exitStatus = execError.status ?? 1;
  }

  assert.equal(exitStatus, 1, "Debe salir con código 1 si se exige aceptación global pero faltan datos de campo");
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { POST } from "../../src/app/api/rum/route";
import {
  calculateP75,
  checkRumRateLimit,
  getCohortValues,
  recordRumMetric,
  resetRumForTests,
  resetRumRateLimitsForTests,
  generateRumReport,
  RateLimitError,
} from "../../src/server/monitoring/rum";
import {
  RUM_DEVICE_CLASSES,
  RUM_METRIC_NAMES,
  RUM_MIN_SAMPLE_COUNT,
  RUM_ROLLING_WINDOW_MS,
  RUM_ROUTES,
  RUM_THRESHOLDS,
  rumMetricInputSchema,
  type RumMetricInput,
} from "../../src/shared/rum-contracts";
import { ApplicationError } from "../../src/server/application-error";

test("S22-26 / AUD-11: Esquema cerrado rechaza cualquier campo extra, PII, URLs completas o UUIDs", () => {
  // Payload válido mínimo
  const validLcp: RumMetricInput = {
    metric: "LCP",
    value: 1450.5,
    route: "/",
    device: "desktop",
    version: "1.0.0",
  };
  assert.equal(rumMetricInputSchema.safeParse(validLcp).success, true);

  // Payload válido con conexión
  const validInp: RumMetricInput = {
    metric: "INP",
    value: 120,
    route: "/demo",
    device: "mobile",
    connection: "4g",
    version: "1.0.0",
  };
  assert.equal(rumMetricInputSchema.safeParse(validInp).success, true);

  // Payload válido CLS
  const validCls: RumMetricInput = {
    metric: "CLS",
    value: 0.045,
    route: "/trazabilidad/:traceId",
    device: "tablet",
    connection: "unknown",
    version: "1.0.0",
  };
  assert.equal(rumMetricInputSchema.safeParse(validCls).success, true);

  // 1. Rechazo de campos extra / PII (strictObject)
  const piiAttempts = [
    { ...validLcp, email: "user@example.invalid" },
    { ...validLcp, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    { ...validLcp, cookie: "session=secret" },
    { ...validLcp, traceId: "00000000000000000000000000000001" },
    { ...validLcp, rawUrl: "https://example.invalid/demo?token=xyz" },
    { ...validLcp, ip: "192.168.1.1" },
    { ...validLcp, headers: { Authorization: "Bearer xyz" } },
  ];
  for (const attempt of piiAttempts) {
    const parsed = rumMetricInputSchema.safeParse(attempt);
    assert.equal(parsed.success, false, `Debió rechazar campo espurio: ${JSON.stringify(attempt)}`);
  }

  // 2. Rechazo de métricas no permitidas o de laboratorio (e.g. TBT, FID, TTFB)
  const invalidMetrics = ["TBT", "FID", "TTFB", "FCP", "SPEED_INDEX"];
  for (const metric of invalidMetrics) {
    const parsed = rumMetricInputSchema.safeParse({ ...validLcp, metric });
    assert.equal(parsed.success, false, `Debió rechazar métrica no permitida: ${metric}`);
  }

  // 3. Rechazo de rutas arbitrarias o con parámetros sin normalizar
  const invalidRoutes = [
    "/admin",
    "/demo?query=123",
    "/trazabilidad/abc-123-uuid",
    "https://jopoi.org/",
  ];
  for (const route of invalidRoutes) {
    const parsed = rumMetricInputSchema.safeParse({ ...validLcp, route });
    assert.equal(parsed.success, false, `Debió rechazar ruta no normalizada: ${route}`);
  }

  // 4. Rechazo de valores negativos, infinitos o NaN
  for (const value of [-1, -0.01, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const parsed = rumMetricInputSchema.safeParse({ ...validLcp, value });
    assert.equal(parsed.success, false, `Debió rechazar valor inválido: ${value}`);
  }
});

test("S22-26 / AUD-11: Ingesta HTTP POST /api/rum valida cuerpo, acota a 2048 bytes y responde 200 no-store", async () => {
  resetRumForTests();

  // 1. Envío válido
  const validRequest = new Request("http://127.0.0.1/api/rum", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "10.0.0.1",
    },
    body: JSON.stringify({
      metric: "LCP",
      value: 1200,
      route: "/",
      device: "desktop",
      version: "1.0.0",
    }),
  });

  const response = await POST(validRequest);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const responseData = await response.json();
  assert.equal(responseData.accepted, true);
  assert.ok(typeof responseData.recordedAt === "string");

  // 2. Envío con campos extra es rechazado con 400 (INVALID_INPUT)
  const invalidBodyRequest = new Request("http://127.0.0.1/api/rum", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "10.0.0.1",
    },
    body: JSON.stringify({
      metric: "LCP",
      value: 1200,
      route: "/",
      device: "desktop",
      version: "1.0.0",
      extraField: "leak",
    }),
  });

  const invalidResponse = await POST(invalidBodyRequest);
  assert.equal(invalidResponse.status, 400);

  // 3. Envío con cuerpo superior a 2048 bytes es rechazado con 400 (INVALID_INPUT)
  const hugePayload = JSON.stringify({
    metric: "LCP",
    value: 1200,
    route: "/",
    device: "desktop",
    version: "1.0.0",
    padding: "x".repeat(3000),
  });

  const hugeRequest = new Request("http://127.0.0.1/api/rum", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "10.0.0.1",
    },
    body: hugePayload,
  });

  const hugeResponse = await POST(hugeRequest);
  assert.equal(hugeResponse.status, 400);
});

test("S22-26 / AUD-11: Rate limiting estricto (60/min por cliente y 1000/min global)", () => {
  resetRumRateLimitsForTests();
  const baseTime = Date.now();

  const clientReq = new Request("http://127.0.0.1/api/rum", {
    headers: { "x-forwarded-for": "192.168.1.50" },
  });

  // Primeras 60 peticiones dentro del minuto deben permitirse
  for (let i = 0; i < 60; i++) {
    assert.doesNotThrow(() => checkRumRateLimit(clientReq, baseTime));
  }

  // Petición 61 del mismo cliente debe fallar con RateLimitError
  assert.throws(
    () => checkRumRateLimit(clientReq, baseTime),
    (err: unknown) => err instanceof RateLimitError && err.retryAfter > 0,
  );

  // Otro cliente aún puede enviar dentro de su cuota
  const otherClientReq = new Request("http://127.0.0.1/api/rum", {
    headers: { "x-forwarded-for": "192.168.1.51" },
  });
  assert.doesNotThrow(() => checkRumRateLimit(otherClientReq, baseTime));

  // Límite global: si se acumulan más de 1000 peticiones globales, bloquea a todos
  resetRumRateLimitsForTests();
  for (let i = 0; i < 1000; i++) {
    const req = new Request("http://127.0.0.1/api/rum", {
      headers: { "x-forwarded-for": `10.0.${Math.floor(i / 50)}.${i % 50}` },
    });
    assert.doesNotThrow(() => checkRumRateLimit(req, baseTime));
  }

  // La petición 1001 global debe fallar
  const req1001 = new Request("http://127.0.0.1/api/rum", {
    headers: { "x-forwarded-for": "10.100.1.1" },
  });
  assert.throws(
    () => checkRumRateLimit(req1001, baseTime),
    (err: unknown) => err instanceof RateLimitError,
  );
});

test("S22-26 / AUD-11: Cálculo exacto de p75 y capacidad acotada en memoria (1000 muestras por cohorte)", () => {
  resetRumForTests();

  // Test de la función matemática calculateP75
  assert.equal(calculateP75([]), null);
  assert.equal(calculateP75([100]), 100);
  assert.equal(calculateP75([100, 200, 300, 400]), 400); // index = floor(4 * 0.75) = 3 -> 400
  assert.equal(calculateP75([0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08]), 0.07); // floor(8*0.75) = 6 -> 0.07

  // Registrar 1050 muestras para una cohorte
  for (let i = 1; i <= 1050; i++) {
    recordRumMetric({
      metric: "INP",
      value: i,
      route: "/",
      device: "desktop",
      version: "1.0.0",
    });
  }

  const values = getCohortValues("/", "desktop", "INP");
  // La capacidad debe estar acotada a MAX_SAMPLES_PER_COHORT (1000)
  assert.equal(values.length, 1000);
  // Deben haberse conservado las 1000 más recientes (51 a 1050)
  assert.equal(values[0], 51);
  assert.equal(values[999], 1050);
});

test("S22-26 / AUD-11: Ventana móvil de 28 días descarta muestras con antigüedad > 28 días", () => {
  resetRumForTests();
  const now = Date.now();
  const twentyNineDaysAgo = now - (29 * 24 * 3600 * 1000);
  const tenDaysAgo = now - (10 * 24 * 3600 * 1000);

  // Muestra vieja (> 28 días)
  recordRumMetric(
    { metric: "LCP", value: 5000, route: "/demo", device: "mobile", version: "1.0.0" },
    twentyNineDaysAgo,
  );

  // Muestra reciente (< 28 días)
  recordRumMetric(
    { metric: "LCP", value: 1500, route: "/demo", device: "mobile", version: "1.0.0" },
    tenDaysAgo,
  );

  const values = getCohortValues("/demo", "mobile", "LCP", now);
  assert.equal(values.length, 1);
  assert.equal(values[0], 1500);
});

test("S22-26 / AUD-11: Exige ≥ 200 muestras por cohorte y no emite falsos cumplimientos (INSUFFICIENT_DATA)", () => {
  resetRumForTests();
  const now = new Date();

  // Registrar 199 muestras de LCP en "/" para desktop (todas excelentes: 800 ms)
  for (let i = 0; i < 199; i++) {
    recordRumMetric({
      metric: "LCP",
      value: 800,
      route: "/",
      device: "desktop",
      version: "1.0.0",
    });
  }

  let report = generateRumReport(now);
  const cohort199 = report.cohorts.find(
    (c) => c.route === "/" && c.device === "desktop" && c.metric === "LCP",
  );
  assert.ok(cohort199);
  assert.equal(cohort199.sampleCount, 199);
  assert.equal(cohort199.hasSufficientData, false);
  assert.equal(cohort199.status, "INSUFFICIENT_DATA");
  assert.equal(cohort199.p75, null);
  assert.equal(cohort199.withinTarget, null);
  assert.equal(cohort199.rating, "insufficient_data");
  assert.ok(cohort199.note?.includes("Evidencia insuficiente"));
  assert.equal(report.summary.sufficientCohorts, 0);
  assert.equal(report.summary.overallCompliant, null);

  // Agregar la muestra 200
  recordRumMetric({
    metric: "LCP",
    value: 800,
    route: "/",
    device: "desktop",
    version: "1.0.0",
  });

  report = generateRumReport(now);
  const cohort200 = report.cohorts.find(
    (c) => c.route === "/" && c.device === "desktop" && c.metric === "LCP",
  );
  assert.ok(cohort200);
  assert.equal(cohort200.sampleCount, 200);
  assert.equal(cohort200.hasSufficientData, true);
  assert.equal(cohort200.status, "SUFFICIENT_DATA");
  assert.equal(cohort200.p75, 800);
  assert.equal(cohort200.withinTarget, true);
  assert.equal(cohort200.rating, "good");
  assert.equal(cohort200.note, undefined);
  assert.equal(report.summary.sufficientCohorts, 1);
  assert.equal(report.summary.passingCohorts, 1);
  assert.equal(report.summary.overallCompliant, true);
});

test("S22-26 / AUD-11: Preserva objetivos de Core Web Vitals, inpIsLaboratoryTbt=false y NO promedia rutas heterogéneas", () => {
  resetRumForTests();
  const now = new Date();

  // 1. Verificar inpIsLaboratoryTbt es false
  const emptyReport = generateRumReport(now);
  assert.equal(emptyReport.inpIsLaboratoryTbt, false);

  // 2. Verificar que las 36 cohortes existen independientemente
  assert.equal(emptyReport.cohorts.length, 36); // 4 rutas * 3 dispositivos * 3 métricas
  assert.equal(emptyReport.summary.totalCohorts, 36);

  // 3. Simular ruta "/" con LCP excelente (1000 ms) en 200 muestras
  for (let i = 0; i < 200; i++) {
    recordRumMetric({
      metric: "LCP",
      value: 1000,
      route: "/",
      device: "desktop",
      version: "1.0.0",
    });
  }

  // 4. Simular ruta "/demo" con LCP degradado (3500 ms) en 200 muestras
  for (let i = 0; i < 200; i++) {
    recordRumMetric({
      metric: "LCP",
      value: 3500,
      route: "/demo",
      device: "desktop",
      version: "1.0.0",
    });
  }

  const report = generateRumReport(now);

  const homeLcp = report.cohorts.find(
    (c) => c.route === "/" && c.device === "desktop" && c.metric === "LCP",
  );
  const demoLcp = report.cohorts.find(
    (c) => c.route === "/demo" && c.device === "desktop" && c.metric === "LCP",
  );

  assert.ok(homeLcp && demoLcp);
  assert.equal(homeLcp.p75, 1000);
  assert.equal(homeLcp.withinTarget, true);
  assert.equal(homeLcp.rating, "good");

  // La degradación de "/demo" NO queda ocultada por el buen rendimiento de "/"
  assert.equal(demoLcp.p75, 3500);
  assert.equal(demoLcp.withinTarget, false);
  assert.equal(demoLcp.rating, "needs-improvement");

  // El cumplimiento global NO es verdadero porque hay una cohorte que no cumple
  assert.equal(report.summary.sufficientCohorts, 2);
  assert.equal(report.summary.passingCohorts, 1);
  assert.equal(report.summary.overallCompliant, false);
});

test("S22-26 / AUD-11: CLI scripts/rum-report.ts genera salida JSON y tabular con calibración de muestras", () => {
  const nodeBinary = process.execPath;

  // Ejecución con --json y --min-samples 50
  const result = spawnSync(
    nodeBinary,
    ["--conditions=react-server", "--import", "tsx", "scripts/rum-report.ts", "--json", "--min-samples", "50"],
    {
      windowsHide: true,
      encoding: "utf8",
      timeout: 15000,
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.minSamplesRequired, 50);
  assert.equal(parsed.inpIsLaboratoryTbt, false);
  assert.equal(Array.isArray(parsed.cohorts), true);
  assert.equal(parsed.cohorts.length, 36);

  // Ejecución sin --json (salida tabular)
  const textResult = spawnSync(
    nodeBinary,
    ["--conditions=react-server", "--import", "tsx", "scripts/rum-report.ts", "--min-samples", "10"],
    {
      windowsHide: true,
      encoding: "utf8",
      timeout: 15000,
    },
  );

  assert.equal(textResult.status, 0, textResult.stderr);
  assert.ok(textResult.stdout.includes("Informe RUM de Rendimiento Real"));
  assert.ok(textResult.stdout.includes("TBT como INP:           NO"));
});

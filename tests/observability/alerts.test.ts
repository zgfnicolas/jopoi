import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ApplicationError } from "../../src/server/application-error";
import { apiBoundary } from "../../src/server/http";
import { RateLimitError } from "../../src/server/security/rate-limit";
import { checkLiveness, checkReadiness, checkStartup } from "../../src/server/monitoring/health";
import {
  ALERT_CATALOG,
  AlertDispatcher,
  AlertEvaluator,
  AuthorizedTestSink,
  type AlertNotification,
} from "../../src/server/monitoring/alerts";

test("S22-32 / AUD-09: Liveness probe no consulta DB ni HCS y mide respuesta y event loop", () => {
  const result = checkLiveness();

  assert.equal(result.status, "live");
  assert.ok(typeof result.uptimeSeconds === "number" && result.uptimeSeconds >= 0);
  assert.ok(typeof result.timestamp === "string" && !Number.isNaN(Date.parse(result.timestamp)));
  assert.ok(result.runtime.memoryBytes > 0);
  assert.ok(result.runtime.eventLoopDelayMs >= 0);
});

test("S22-32 / AUD-09: Readiness probe tiene presupuesto y distingue falla SQL (503) de degradación HCS (200 con degraded=true)", async () => {
  // Caso 1: SQL y HCS sanos -> 200 OK, degraded: false
  const healthy = await checkReadiness({
    dbTimeoutMs: 2000,
    checkDb: async () => ({ latencyMs: 5 }),
    checkHcs: async () => ({ status: "available", details: "HCS operativo" }),
  });
  assert.equal(healthy.status, "ready");
  assert.equal(healthy.degraded, false);
  assert.equal(healthy.checks.database.status, "available");
  assert.equal(healthy.checks.database.latencyMs, 5);
  assert.equal(healthy.checks.hedera.status, "available");

  // Caso 2: SQL sano pero HCS degradado o no configurado -> 200 OK con degraded=true (NO derriba la instancia)
  const degradedHcs = await checkReadiness({
    dbTimeoutMs: 2000,
    checkDb: async () => ({ latencyMs: 8 }),
    checkHcs: async () => ({ status: "degraded", details: "Mirror Node testnet lento o atraso en outbox" }),
  });
  assert.equal(degradedHcs.status, "ready");
  assert.equal(degradedHcs.degraded, true);
  assert.equal(degradedHcs.checks.database.status, "available");
  assert.equal(degradedHcs.checks.hedera.status, "degraded");

  // Caso 3: Fallo o timeout en SQL -> lanza ApplicationError("DATABASE_UNAVAILABLE") con retryAfterSeconds=5
  await assert.rejects(
    async () => {
      await checkReadiness({
        dbTimeoutMs: 100,
        checkDb: async () => {
          throw new ApplicationError("DATABASE_UNAVAILABLE", undefined, { retryAfterSeconds: 5 });
        },
        checkHcs: async () => ({ status: "available", details: "HCS operativo" }),
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof ApplicationError);
      assert.equal(error.code, "DATABASE_UNAVAILABLE");
      assert.equal(error.retryAfterSeconds, 5);
      return true;
    },
  );
});

test("S22-32 / AUD-09: Startup probe se justifica para entornos serverless/contenedores sin barridos pesados", () => {
  const result = checkStartup();

  assert.equal(result.status, "started");
  assert.equal(result.runtime, "serverless");
  assert.ok(typeof result.initializedAt === "string" && !Number.isNaN(Date.parse(result.initializedAt)));
});

test("S22-26 / D14 / AUD-09: Exclusiones transparentes en error budget (4xx excluidos; 5xx computados)", () => {
  const evaluator = new AlertEvaluator();
  const now = Date.now();

  // Inyectar 100 errores 4xx del cliente (400, 401, 403, 404, 409, 412, 429)
  for (let i = 0; i < 100; i++) {
    const clientStatus = [400, 401, 403, 404, 409, 412, 429][i % 7]!;
    evaluator.recordRequest({ status: clientStatus, timestamp: now - 1000 });
  }

  // Las exclusiones no deben generar muestras en el presupuesto ni activar alertas
  const reportNoErrors = evaluator.evaluate(now);
  assert.equal(reportNoErrors.firingAlerts.length, 0);
  assert.equal(reportNoErrors.alertDetails.BURN_RATE_CRITICAL.isFiring, false);
  assert.equal(reportNoErrors.alertDetails.CONSECUTIVE_SERVER_ERRORS.isFiring, false);

  // Inyectar un error 500: se computa como falla de servicio
  evaluator.recordRequest({ status: 500, timestamp: now });
  const reportOne500 = evaluator.evaluate(now);
  assert.equal(reportOne500.alertDetails.CONSECUTIVE_SERVER_ERRORS.details.consecutiveCount, 1);
});

test("S22-26 / D14 / AUD-09: Alertas de Burn Rate 14.4x (crítico) y 6.0x (advertencia) con multi-ventana y auto-resolución", async () => {
  const evaluator = new AlertEvaluator();
  const testSink = new AuthorizedTestSink();
  const dispatcher = new AlertDispatcher({ sink: testSink });
  const baseTime = Date.now();

  // Simular 100 peticiones en la última hora: 92 exitosas (200) y 8 fallas (500)
  // Tasa de error = 8% >= 7.2% (14.4x de 0.5% error budget)
  for (let i = 0; i < 92; i++) {
    evaluator.recordRequest({ status: 200, timestamp: baseTime - i * 30000 });
  }
  for (let i = 0; i < 8; i++) {
    evaluator.recordRequest({ status: 500, timestamp: baseTime - i * 20000 });
  }

  // 1. Evaluación y despacho: debe activar BURN_RATE_CRITICAL
  const outageReport = evaluator.evaluate(baseTime);
  assert.ok(outageReport.alertDetails.BURN_RATE_CRITICAL.isFiring);

  const notifications = await dispatcher.dispatch(outageReport);
  const criticalAlert = notifications.find((n) => n.alertId === "BURN_RATE_CRITICAL");

  assert.ok(criticalAlert !== undefined);
  assert.equal(criticalAlert.status, "FIRING");
  assert.equal(criticalAlert.severity, "CRITICAL");
  assert.equal(criticalAlert.owner, "@guardia-backend");
  assert.equal(criticalAlert.runbookUrl, "/docs/runbooks/alerta-burn-rate.md");
  assert.ok((criticalAlert.details.burnRate1h as number) >= 14.4);

  // 2. Simular recuperación: cesan los errores y entran 50 peticiones exitosas en los últimos 5 minutos
  const recoveryTime = baseTime + 6 * 60 * 1000;
  for (let i = 0; i < 50; i++) {
    evaluator.recordRequest({ status: 200, timestamp: recoveryTime - i * 2000 });
  }

  const recoveryReport = evaluator.evaluate(recoveryTime);
  assert.equal(recoveryReport.alertDetails.BURN_RATE_CRITICAL.isFiring, false);

  const recoveryNotifications = await dispatcher.dispatch(recoveryReport);
  const resolvedAlert = recoveryNotifications.find((n) => n.alertId === "BURN_RATE_CRITICAL");

  assert.ok(resolvedAlert !== undefined);
  assert.equal(resolvedAlert.status, "RESOLVED");
  assert.equal(resolvedAlert.owner, "@guardia-backend");
});

test("S22-26 / AUD-09: Señal de bajo tráfico activa CONSECUTIVE_SERVER_ERRORS y se resuelve con 200", async () => {
  const evaluator = new AlertEvaluator();
  const testSink = new AuthorizedTestSink();
  const dispatcher = new AlertDispatcher({ sink: testSink });
  const now = Date.now();

  // 2 errores consecutivos en bajo volumen (no alcanza el umbral de 3)
  evaluator.recordRequest({ status: 500, timestamp: now - 2000 });
  evaluator.recordRequest({ status: 500, timestamp: now - 1000 });
  let report = evaluator.evaluate(now);
  assert.equal(report.alertDetails.CONSECUTIVE_SERVER_ERRORS.isFiring, false);

  // Tercer error consecutivo -> activa la señal
  evaluator.recordRequest({ status: 500, timestamp: now });
  report = evaluator.evaluate(now);
  assert.equal(report.alertDetails.CONSECUTIVE_SERVER_ERRORS.isFiring, true);

  let notifications = await dispatcher.dispatch(report);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.alertId, "CONSECUTIVE_SERVER_ERRORS");
  assert.equal(notifications[0]?.status, "FIRING");
  assert.equal(notifications[0]?.severity, "WARNING");
  assert.equal(notifications[0]?.owner, "@guardia-backend");

  // Respuesta exitosa (200 OK) -> auto-resolución inmediata
  evaluator.recordRequest({ status: 200, timestamp: now + 500 });
  report = evaluator.evaluate(now + 500);
  assert.equal(report.alertDetails.CONSECUTIVE_SERVER_ERRORS.isFiring, false);

  notifications = await dispatcher.dispatch(report);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.alertId, "CONSECUTIVE_SERVER_ERRORS");
  assert.equal(notifications[0]?.status, "RESOLVED");
});

test("S22-27 / AUD-02 / AUD-09: Señales de Cron Ausente y Retención Demorada con caída y recuperación simulada", async () => {
  const evaluator = new AlertEvaluator();
  const testSink = new AuthorizedTestSink();
  const dispatcher = new AlertDispatcher({ sink: testSink });
  const now = Date.now();

  // 1. Cron ausente (> 36 horas = 129_600_000 ms)
  evaluator.setSystemHealth({
    cronLagMs: 38 * 3_600_000,
    oldestExpiredAgeMs: 10 * 3_600_000,
    stalledCategories: [],
  });

  let report = evaluator.evaluate(now);
  assert.equal(report.alertDetails.CRON_ABSENT.isFiring, true);
  assert.equal(report.alertDetails.RETENTION_DELAYED.isFiring, false);

  let notifications = await dispatcher.dispatch(report);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.alertId, "CRON_ABSENT");
  assert.equal(notifications[0]?.status, "FIRING");
  assert.equal(notifications[0]?.owner, "@operaciones-cron");
  assert.equal(notifications[0]?.runbookUrl, "/docs/runbooks/alerta-cron-ausente.md");

  // Cron se ejecuta exitosamente -> se resuelve
  evaluator.setSystemHealth({ cronLagMs: 1_000 });
  report = evaluator.evaluate(now);
  notifications = await dispatcher.dispatch(report);
  assert.equal(notifications.find((n) => n.alertId === "CRON_ABSENT")?.status, "RESOLVED");

  // 2. Retención demorada (> 36 horas)
  evaluator.setSystemHealth({
    oldestExpiredAgeMs: 40 * 3_600_000,
    stalledCategories: ["runs"],
  });
  report = evaluator.evaluate(now);
  assert.equal(report.alertDetails.RETENTION_DELAYED.isFiring, true);

  notifications = await dispatcher.dispatch(report);
  assert.equal(notifications.find((n) => n.alertId === "RETENTION_DELAYED")?.status, "FIRING");

  // Limpieza exitosa de datos vencidos -> se resuelve
  evaluator.setSystemHealth({
    oldestExpiredAgeMs: 12 * 3_600_000,
    stalledCategories: [],
  });
  report = evaluator.evaluate(now);
  notifications = await dispatcher.dispatch(report);
  assert.equal(notifications.find((n) => n.alertId === "RETENTION_DELAYED")?.status, "RESOLVED");
});

test("AUD-09: Alerta DATABASE_UNAVAILABLE y HCS_BACKLOG_STALLED con owner y runbook", async () => {
  const evaluator = new AlertEvaluator();
  const testSink = new AuthorizedTestSink();
  const dispatcher = new AlertDispatcher({ sink: testSink });
  const now = Date.now();

  // Caída de base de datos
  evaluator.setSystemHealth({ databaseStatus: "unavailable" });
  let report = evaluator.evaluate(now);
  assert.equal(report.alertDetails.DATABASE_UNAVAILABLE.isFiring, true);

  let notifications = await dispatcher.dispatch(report);
  const dbAlert = notifications.find((n) => n.alertId === "DATABASE_UNAVAILABLE");
  assert.ok(dbAlert !== undefined);
  assert.equal(dbAlert.status, "FIRING");
  assert.equal(dbAlert.severity, "CRITICAL");
  assert.equal(dbAlert.owner, "@infraestructura-datos");
  assert.equal(dbAlert.runbookUrl, "/docs/runbooks/alerta-base-datos.md");

  // Recuperación de base de datos
  evaluator.setSystemHealth({ databaseStatus: "available" });
  report = evaluator.evaluate(now);
  notifications = await dispatcher.dispatch(report);
  assert.equal(notifications.find((n) => n.alertId === "DATABASE_UNAVAILABLE")?.status, "RESOLVED");

  // Atraso de publicaciones Hedera HCS (> 10 publicaciones pendientes)
  evaluator.setSystemHealth({ pendingPublications: 15, oldestPendingAgeMs: 4_500_000 });
  report = evaluator.evaluate(now);
  assert.equal(report.alertDetails.HCS_BACKLOG_STALLED.isFiring, true);

  notifications = await dispatcher.dispatch(report);
  const hcsAlert = notifications.find((n) => n.alertId === "HCS_BACKLOG_STALLED");
  assert.ok(hcsAlert !== undefined);
  assert.equal(hcsAlert.status, "FIRING");
  assert.equal(hcsAlert.severity, "WARNING");
  assert.equal(hcsAlert.owner, "@integracion-hedera");
  assert.equal(hcsAlert.runbookUrl, "/docs/runbooks/alerta-hedera-atraso.md");

  // Drenado del outbox HCS
  evaluator.setSystemHealth({ pendingPublications: 2, oldestPendingAgeMs: 120_000 });
  report = evaluator.evaluate(now);
  notifications = await dispatcher.dispatch(report);
  assert.equal(notifications.find((n) => n.alertId === "HCS_BACKLOG_STALLED")?.status, "RESOLVED");
});

test("S22-08 / AUD-04: Vistas de error muestran referencia segura investigable (digest) sin filtrar causas privadas", async () => {
  // 1. Verificar error.tsx y global-error.tsx por contrato estático seguro
  const errorPageSource = readFileSync("src/app/error.tsx", "utf8");
  assert.ok(errorPageSource.includes("error.digest"));
  assert.ok(errorPageSource.includes('data-testid="error-reference"'));
  assert.ok(!errorPageSource.includes("error.message"));
  assert.ok(!errorPageSource.includes("error.stack"));

  const globalErrorSource = readFileSync("src/app/global-error.tsx", "utf8");
  assert.ok(globalErrorSource.includes("error.digest"));
  assert.ok(globalErrorSource.includes('data-testid="error-reference"'));
  assert.ok(!globalErrorSource.includes("error.message"));
  assert.ok(!globalErrorSource.includes("error.stack"));

  // 2. Verificar semántica de 403, 429, 503 y Retry-After en apiBoundary
  const request = new Request("https://example.invalid/api/demo/session", {
    headers: { Accept: "application/json" },
  });

  // 403: No lleva Retry-After, pero incluye X-Request-Id seguro
  const res403 = await apiBoundary("session.read", request, async () => {
    throw new ApplicationError("WRONG_ROLE");
  });
  assert.equal(res403.status, 403);
  assert.ok(res403.headers.get("x-request-id") !== null);
  assert.equal(res403.headers.get("retry-after"), null);

  // 429: Lleva Retry-After numérico real
  const res429 = await apiBoundary("session.read", request, async () => {
    throw new RateLimitError(30);
  });
  assert.equal(res429.status, 429);
  assert.equal(res429.headers.get("retry-after"), "30");
  assert.ok(res429.headers.get("x-request-id") !== null);

  // 503: Lleva Retry-After numérico real de indisponibilidad
  const res503 = await apiBoundary("health.ready", request, async () => {
    throw new ApplicationError("DATABASE_UNAVAILABLE", undefined, { retryAfterSeconds: 5 });
  });
  assert.equal(res503.status, 503);
  assert.equal(res503.headers.get("retry-after"), "5");
  assert.ok(res503.headers.get("x-request-id") !== null);
});

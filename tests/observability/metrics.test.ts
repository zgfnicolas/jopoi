import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  CLOSED_ROUTES,
  DurationHistogram,
  exportMetricsReport,
  getCardinalityStats,
  normalizeMethod,
  normalizeRoute,
  recordActionCommitted,
  recordConflict,
  recordExternalCapacityAcquire,
  recordHttpMetric,
  recordPoolError,
  recordPoolWait,
  recordReplay,
  recordUncertainTransaction,
  resetMetricsForTests,
  statusToClass,
  updateMaintenanceMetrics,
  updateOperationalBacklog,
} from "../../src/server/metrics";
import {
  createRequestContext,
  getDroppedDiagnosticsCount,
  logDiagnostic,
  resetDiagnosticsExporterForTests,
  withRequestContext,
} from "../../src/server/diagnostics";

test("S22-26: RED expone rate, errors e histogramas con p50/p95/p99 por vocabularios cerrados (no solo promedio)", () => {
  resetMetricsForTests();

  // Simular 40 solicitudes en diferentes rutas y duraciones
  const latencies = [15, 25, 40, 80, 120, 250, 400, 600, 720, 850, 1100, 1400];
  for (let i = 0; i < 40; i++) {
    const latency = latencies[i % latencies.length]!;
    const status = i === 10 || i === 20 ? 500 : i === 15 ? 404 : 200;
    const route = i % 2 === 0 ? "/api/demo/runs/:traceId/commands" : "/api/traces/:traceId";
    recordHttpMetric({
      method: "POST",
      route,
      status,
      durationMs: latency,
      outcome: status >= 500 ? "error" : "success",
    });
  }

  const report = exportMetricsReport();
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.service.name, "jopoi");
  assert.equal(typeof report.service.version, "string");
  assert.equal(report.red.summary.totalRequests, 40);
  assert.equal(report.red.summary.totalErrors, 2); // 2 errores 500
  assert.equal(report.red.summary.errorRate, 0.05);

  const lat = report.red.summary.latencyMs;
  assert.equal(lat.count, 40);
  assert.ok(lat.avg > 0);
  assert.ok(lat.min <= lat.max);
  assert.ok(lat.p50 > 0);
  assert.ok(lat.p95 > 0);
  assert.ok(lat.p99 > 0);
  // Monotonía de percentiles
  assert.ok(lat.p50 <= lat.p95, `p50 (${lat.p50}) debe ser <= p95 (${lat.p95})`);
  assert.ok(lat.p95 <= lat.p99, `p95 (${lat.p95}) debe ser <= p99 (${lat.p99})`);
  // Comprobar que no se informa sólo promedio
  assert.notEqual(lat.p50, undefined);
  assert.notEqual(lat.p95, undefined);
  assert.notEqual(lat.p99, undefined);

  // Comprobar desglose por ruta cerrada
  const commandRoute = report.red.byRoute["/api/demo/runs/:traceId/commands"];
  assert.ok(commandRoute);
  assert.equal(commandRoute.requests, 20);
  assert.ok(commandRoute.latencyMs.p50 > 0);
  assert.ok(commandRoute.latencyMs.p95 >= commandRoute.latencyMs.p50);

  resetMetricsForTests();
});

test("S22-26/D17: USE observa pool (instancia vs global), memoria/event loop y permisos externos", () => {
  resetMetricsForTests();

  // 1. Pool: espera, errores y modelo de capacidad
  recordPoolWait(25);
  recordPoolWait(180);
  recordPoolError("pool");
  recordPoolError("connection");

  // 2. Capacidad externa: permisos y saturación
  recordExternalCapacityAcquire(true);
  recordExternalCapacityAcquire(true);
  recordExternalCapacityAcquire(false); // rechazo por saturación
  recordExternalCapacityAcquire(false, true); // conflicto de serialización

  const report = exportMetricsReport();

  // Verificación del Pool
  const pool = report.use.pool;
  assert.equal(pool.perInstance.max, 2);
  assert.equal(pool.perInstance.min, 0);
  assert.equal(pool.perInstance.timeoutMs, 3000);
  assert.equal(pool.perInstance.waitMs.count, 2);
  assert.ok(pool.perInstance.waitMs.p50 > 0);
  assert.equal(pool.errors.poolErrors, 1);
  assert.equal(pool.errors.connectionErrors, 1);

  // Distinción de capacidad global (AUD-12, D17)
  assert.equal(pool.globalCapacity.perInstanceMax, 2);
  assert.equal(pool.globalCapacity.estimatedMaxInstances, 8);
  assert.equal(pool.globalCapacity.reservedConnections, 4);
  assert.equal(pool.globalCapacity.calculatedGlobalLimit, 20); // 8 * 2 + 4
  assert.equal(pool.globalCapacity.formula, "max_instances * per_instance_max + reserved_connections");

  // Verificación de runtime (memoria y event loop)
  const runtime = report.use.runtime;
  assert.ok(runtime.memoryBytes.heapUsed > 0);
  assert.ok(runtime.memoryBytes.heapTotal > 0);
  assert.ok(runtime.memoryBytes.rss > 0);
  assert.ok(runtime.eventLoopDelayMs.p50 >= 0);
  assert.ok(runtime.eventLoopDelayMs.p95 >= 0);
  assert.ok(runtime.eventLoopDelayMs.p99 >= 0);
  assert.ok(runtime.eventLoopDelayMs.p50 <= runtime.eventLoopDelayMs.p99);

  // Verificación de capacidad externa
  const ext = report.use.externalCapacity;
  assert.equal(ext.slots, 2);
  assert.equal(ext.acquiredTotal, 2);
  assert.equal(ext.saturationRejections, 2);
  assert.equal(ext.conflicts, 1);

  resetMetricsForTests();
});

test("S22-26/AUD-09: Negocio mide acciones, replays, conflictos, cuota HCS, incertidumbre y atraso", () => {
  resetMetricsForTests();

  // Acciones y eventos operativos
  recordActionCommitted();
  recordActionCommitted();
  recordReplay();
  recordConflict();
  recordUncertainTransaction();

  // Cuota HCS y atraso de publicaciones
  updateOperationalBacklog({
    hcsQuota: { limit: 100, used: 42, remaining: 58, resetsAt: "2026-11-15T00:00:00.000Z" },
    publications: { pendingCount: 4, oldestPendingAgeMs: 95000 },
  });

  // Mantenimiento y limpieza por categoría
  updateMaintenanceMetrics({
    lastCompletedAt: new Date(Date.now() - 3600000).toISOString(),
    lastPartialAt: null,
    oldestExpiredAgeMs: 7200000,
    withinRetentionTarget: true,
    stalledCategories: [],
    counts: { runs: 15, contacts: 3, sessions: 8, quotas: 1, leases: 1, rateBuckets: 50 },
  });

  const report = exportMetricsReport();
  const biz = report.business;
  assert.equal(biz.actionsCommitted, 2);
  assert.equal(biz.replays, 1);
  assert.equal(biz.conflicts, 1);
  assert.equal(biz.uncertainTransactions, 1);

  // Cuota HCS
  assert.equal(biz.hcsQuota.limit, 100);
  assert.equal(biz.hcsQuota.used, 42);
  assert.equal(biz.hcsQuota.remaining, 58);

  // Publicaciones pendientes
  assert.equal(biz.publications.pendingCount, 4);
  assert.equal(biz.publications.oldestPendingAgeMs, 95000);

  // Limpieza y atraso
  assert.equal(biz.maintenance.withinRetentionTarget, true);
  assert.equal(biz.maintenance.oldestExpiredAgeMs, 7200000);
  assert.ok(typeof biz.maintenance.cronLagMs === "number" && biz.maintenance.cronLagMs >= 3500000);
  assert.equal(biz.maintenance.cleanedByCategory.runs, 15);
  assert.equal(biz.maintenance.cleanedByCategory.contacts, 3);
  assert.equal(biz.maintenance.cleanedByCategory.rateBuckets, 50);

  resetMetricsForTests();
});

test("S22-26/D13: Cardinalidad estrictamente acotada: miles de UUIDs, emails y URLs dinámicas no multiplican labels", () => {
  resetMetricsForTests();

  const initialStats = getCardinalityStats();
  assert.equal(initialStats.seriesCount, 0);
  assert.ok(initialStats.maxPossibleSeries <= 500);

  // Inyectar 1000 solicitudes con identificadores únicos (UUIDs, emails, query strings)
  const hostileUUIDs = Array.from({ length: 1000 }, () => randomUUID());
  for (let i = 0; i < hostileUUIDs.length; i++) {
    const id = hostileUUIDs[i]!;
    // URLs dinámicas que en sistemas mal diseñados generarían 1000 métricas distintas
    const dynamicUrl = i % 3 === 0
      ? `/api/traces/${id}`
      : i % 3 === 1
        ? `/api/demo/runs/${id}/commands?email=user-${id}@example.invalid`
        : `/api/unknown-endpoint/${id}`;

    recordHttpMetric({
      method: i % 2 === 0 ? "GET" : "POST",
      route: dynamicUrl,
      status: 200,
      durationMs: 10 + (i % 50),
    });
  }

  const finalStats = getCardinalityStats();
  assert.ok(finalStats.isBounded);
  // Las 1000 solicitudes deben normalizarse en un puñado de series cerradas, NUNCA 1000 series
  assert.ok(finalStats.seriesCount <= 10, `Series count (${finalStats.seriesCount}) debe ser <= 10, no 1000`);

  const report = exportMetricsReport();
  const serialized = JSON.stringify(report);

  // Ningún UUID ni email generado debe aparecer en las claves o labels de métricas
  for (const sampleId of hostileUUIDs.slice(0, 10)) {
    assert.ok(!serialized.includes(sampleId), `UUID ${sampleId} no debe ser una dimensión de métricas`);
    assert.ok(!serialized.includes(`user-${sampleId}@example.invalid`), `Email no debe ser una dimensión`);
  }

  // Las rutas en el reporte son exclusivamente del catálogo cerrado
  for (const routeKey of Object.keys(report.red.byRoute)) {
    assert.ok(CLOSED_ROUTES.includes(routeKey as (typeof CLOSED_ROUTES)[number]), `Ruta ${routeKey} debe pertenecer a CLOSED_ROUTES`);
  }

  resetMetricsForTests();
});

test("S22-26/D14: Continuidad ante falla del colector/exporter y cálculo de SLOs en reporte versionado", () => {
  resetDiagnosticsExporterForTests();
  resetMetricsForTests();

  // 1. Simular saturación o caída del exportador stderr
  const originalWrite = process.stderr.write;
  try {
    // Pipe destruido/cerrado que falla
    process.stderr.write = (() => false) as unknown as typeof process.stderr.write;

    // Ejecutar transacciones diagnósticas con logDiagnostic
    const context = createRequestContext("runs.command");
    withRequestContext(context, () => {
      logDiagnostic({ event: "http.completed", outcome: "success", code: "OK", status: 200, durationMs: 45 });
      logDiagnostic({ event: "operation.committed", outcome: "success", code: "OPERATION_COMMITTED", durationMs: 0 });
      logDiagnostic({ event: "database.connection", outcome: "error", code: "DATABASE_POOL_ERROR", durationMs: 0 });
    });

    // Las emisiones descartadas se computan
    assert.ok(getDroppedDiagnosticsCount() >= 1);

    // Pero las métricas en memoria CONTINÚAN registrándose sin interrupción
    const report = exportMetricsReport();
    assert.equal(report.red.summary.totalRequests, 1);
    assert.equal(report.business.actionsCommitted, 1);
    assert.equal(report.use.pool.errors.poolErrors, 1);

    // 2. Verificación de SLO indicators (D14)
    const slo = report.sloIndicators;
    assert.equal(slo.availability.sloTarget, 0.995);
    assert.equal(slo.availability.withinSlo, true);
    assert.equal(slo.latencyHot.p95TargetMs, 750);
    assert.equal(slo.latencyHot.p99TargetMs, 1500);
    assert.equal(slo.latencyHot.p95WithinSlo, true);
    assert.equal(slo.maintenance.retentionTargetMs, 129600000); // 36 horas
    assert.equal(slo.maintenance.cronHealthy, true);
  } finally {
    process.stderr.write = originalWrite;
    resetDiagnosticsExporterForTests();
    resetMetricsForTests();
  }
});

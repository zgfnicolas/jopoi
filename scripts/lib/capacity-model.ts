import { z } from "zod";

/**
 * Modelo de Capacidad Global y Conexiones (D17, D02, AUD-01, AUD-12, S22-28)
 *
 * Distingue:
 * - Instancias web/API: N instancias x 2 conexiones cliente cada una.
 * - Conexiones reservadas: CLI (1) + migración directa (1) + reserva operativa (2) = 4.
 * - Pooler (PgBouncer / Neon transaction pooling): multiplexación M:N de clientes hacia PostgreSQL backend.
 * - Parámetros estrictos de conexión, timeouts y zona horaria UTC.
 * - Localidad de funciones y base de datos con justificación del rechazo de render en el Edge.
 */
export const CAPACITY_CONNECTION_SPEC = Object.freeze({
  perInstanceMax: 2,
  perInstanceMin: 0,
  connectionTimeoutMs: 3000,
  idleTimeoutMs: 10000,
  statementTimeoutMs: 5000,
  queryTimeoutMs: 5500,
  timezoneOption: "-c timezone=UTC",
  sslMode: "verify-full",
  documentedMaxInstances: 8,
  webClientConnections: 16, // 8 * 2
  cliReservedConnections: 1,
  migrationReservedConnections: 1,
  operationalReserve: 2,
  totalClientConnections: 20, // 8 * 2 + 1 + 1 + 2
  formula: "max_instances * per_instance_max + cli + migration + operational_reserve",
  poolerType: "pgbouncer-transaction-pooling" as const,
  poolerMultiplexingRatio: "M:N multiplexing (hasta 10.000 clientes concurrentes del pooler se multiplexan en conexiones activas de servidor)" as const,
  estimatedBackendServerConnections: 6, // 4-8 conexiones backend activas suficientes para transacciones cortas
  locality: Object.freeze({
    serverlessFunctionRegion: "iad1 (Washington D.C. / US East)" as const,
    databaseRegion: "us-east-1 (N. Virginia / US East)" as const,
    expectedNetworkLatencyMs: Object.freeze({
      intraRegion: "< 2 ms",
      crossRegion: "40 - 100 ms",
    }),
    edgeRenderingRejectedRationale:
      "El renderizado en Edge distribuye instancias en cientos de ubicaciones alejadas de la base de datos centralizada, multiplicando la latencia de red (40-100+ ms por consulta), carece de soporte completo para pooling TCP transaccional en workers globales y agota rápidamente las cuotas de conexión sin beneficio para páginas dinámicas con estado. Se co-ubican funciones serverless Node.js en la misma región que la base de datos (iad1 / us-east-1), garantizando latencia de red SQL inferior a 2 ms." as const,
  }),
});

/**
 * Techos de admisión propuestos (D02, D03, D17, DEMO_POLICY)
 */
export const ADMISSION_CEILINGS_SPEC = Object.freeze({
  daily: Object.freeze({
    maxNewSessionsGlobal: 100,
    maxNewContactsGlobal: 100,
    maxNewIntentsGlobal: 5000,
    maxIntentsPerRun: 100,
    maxRunsPerSession: 3,
    maxEventsPerRun: 5,
  }),
  windowRateLimits: Object.freeze({
    privateReadsPerMinutePerSession: 30,
    privateReadsPerMinuteGlobal: 1000,
    mutationsPerMinutePerSession: 10,
    mutationsPerMinuteGlobal: 100,
    publicationsPerMinutePerSession: 6,
    publicationsPerMinuteGlobal: 60,
  }),
  hcsDailyLimit: 100,
});

/**
 * Objetivos de ingeniería SLI / SLO (D14, D17)
 */
export const CAPACITY_SLO_TARGETS = Object.freeze({
  hotApiP95MaxMs: 750,
  hotApiP99MaxMs: 1500,
  poolWaitP95MaxMs: 50,
  poolWaitP99MaxMs: 100,
  availabilityMin: 0.995,
  maxConnectionsPerInstance: 2,
  maxErrorRateUnderAdmission: 0,
});

/**
 * Volumen mínimo requerido para el dataset sintético (equivalente a S21)
 */
export const MIN_DATASET_VOLUMES = Object.freeze({
  sessions: 1000,
  runs: 3000,
  receipts: 15000,
  events: 15000,
  publications: 15000,
  demoRequests: 10000,
});

export interface RouteMeasurement {
  readonly route: string;
  readonly path: string;
  readonly method: "GET" | "POST";
  readonly state: "cold" | "warm";
  readonly concurrency: number;
  readonly samplesCount: number;
  readonly p50Ms: number;
  readonly p90Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly avgMs: number;
  readonly errorsCount: number;
  readonly rejectionsCount: number;
  readonly maxObservedConnections: number;
}

export interface MemoryMetrics {
  readonly rssBytes: number;
  readonly heapTotalBytes: number;
  readonly heapUsedBytes: number;
  readonly externalBytes: number;
}

export interface CapacityReport {
  readonly revision: string;
  readonly dirty: boolean;
  readonly fingerprint: string;
  readonly generatedAt: string;
  readonly environment: string;
  readonly isProductionBuild: boolean;
  readonly dataset: {
    readonly sessions: number;
    readonly runs: number;
    readonly receipts: number;
    readonly events: number;
    readonly publications: number;
    readonly demoRequests: number;
    readonly queryPlansAnalyzed: boolean;
  };
  readonly connectionModel: typeof CAPACITY_CONNECTION_SPEC;
  readonly admissionCeilings: typeof ADMISSION_CEILINGS_SPEC;
  readonly sloTargets: typeof CAPACITY_SLO_TARGETS;
  readonly coldStart: {
    readonly route: string;
    readonly durationMs: number;
    readonly withinTarget: boolean;
  };
  readonly warmMeasurements: readonly RouteMeasurement[];
  readonly memory: {
    readonly before: MemoryMetrics;
    readonly after: MemoryMetrics;
    readonly deltaHeapUsedBytes: number;
  };
  readonly sloEvaluation: {
    readonly hotApiP95WithinSlo: boolean;
    readonly hotApiP99WithinSlo: boolean;
    readonly poolWaitWithinSlo: boolean;
    readonly maxConnectionsWithinSpec: boolean;
    readonly memoryBounded: boolean;
    readonly passed: boolean;
    readonly convergenceActionTaken?: string | undefined;
  };
  readonly separationOfConcerns: {
    readonly localProvenCapacity: boolean;
    readonly providerPending: boolean;
    readonly globalAcceptance: boolean;
    readonly pendingExternalVerification: readonly string[];
  };
}

/**
 * Cálculo exacto de percentil sobre un conjunto ordenado ascendente (método de rango).
 */
export function calculateExactPercentile(sortedValues: readonly number[], percentileRatio: number): number {
  if (sortedValues.length === 0) throw new Error("EMPTY_SAMPLES_FOR_PERCENTILE");
  if (percentileRatio < 0 || percentileRatio > 1) throw new Error("INVALID_PERCENTILE_RATIO");
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(percentileRatio * sortedValues.length) - 1),
  );
  const value = sortedValues[index];
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    throw new Error("INVALID_PERCENTILE_VALUE");
  }
  return Math.round(value * 100) / 100;
}

/**
 * Validador estricto de resultados de capacidad y cumplimiento de SLOs.
 */
export function evaluateCapacityReport(report: CapacityReport): {
  passed: boolean;
  violations: readonly string[];
} {
  const violations: string[] = [];

  // 1. Debe ser build de producción real, no Next dev
  if (!report.isProductionBuild) {
    violations.push("El ensayo no fue ejecutado con un build de producción (Next.js start).");
  }
  if (report.environment.toUpperCase().includes("DEV") || report.environment.toUpperCase().includes("DEVELOPMENT")) {
    violations.push(`El entorno reportado ('${report.environment}') no corresponde a un ensayo de producción.`);
  }

  // 2. Dataset al menos equivalente a S21
  if (report.dataset.sessions < MIN_DATASET_VOLUMES.sessions) {
    violations.push(`Volumen de sesiones (${report.dataset.sessions}) inferior al mínimo S21 (${MIN_DATASET_VOLUMES.sessions}).`);
  }
  if (report.dataset.runs < MIN_DATASET_VOLUMES.runs) {
    violations.push(`Volumen de recorridos (${report.dataset.runs}) inferior al mínimo S21 (${MIN_DATASET_VOLUMES.runs}).`);
  }
  if (report.dataset.receipts < MIN_DATASET_VOLUMES.receipts) {
    violations.push(`Volumen de recibos (${report.dataset.receipts}) inferior al mínimo S21 (${MIN_DATASET_VOLUMES.receipts}).`);
  }
  if (report.dataset.events < MIN_DATASET_VOLUMES.events) {
    violations.push(`Volumen de eventos (${report.dataset.events}) inferior al mínimo S21 (${MIN_DATASET_VOLUMES.events}).`);
  }
  if (report.dataset.publications < MIN_DATASET_VOLUMES.publications) {
    violations.push(`Volumen de publicaciones (${report.dataset.publications}) inferior al mínimo S21 (${MIN_DATASET_VOLUMES.publications}).`);
  }
  if (report.dataset.demoRequests < MIN_DATASET_VOLUMES.demoRequests) {
    violations.push(`Volumen de contactos (${report.dataset.demoRequests}) inferior al mínimo S21 (${MIN_DATASET_VOLUMES.demoRequests}).`);
  }
  if (!report.dataset.queryPlansAnalyzed) {
    violations.push("No se analizaron los planes de consulta (EXPLAIN ANALYZE) para el dataset.");
  }

  // 3. Medición de API caliente contra SLI/SLO (p95 <= 750 ms, p99 <= 1500 ms)
  const warmRuns = report.warmMeasurements.filter(m => m.state === "warm");
  if (warmRuns.length === 0) {
    violations.push("No se registraron mediciones en estado caliente.");
  }

  for (const m of warmRuns) {
    // Comprobar que no son sólo promedios
    if (m.p50Ms === undefined || m.p95Ms === undefined || m.p99Ms === undefined) {
      violations.push(`La ruta '${m.route}' (concurrencia ${m.concurrency}) no incluye percentiles p50/p95/p99.`);
    }

    // Monotonía
    if (m.minMs > m.p50Ms || m.p50Ms > m.p90Ms || m.p90Ms > m.p95Ms || m.p95Ms > m.p99Ms || m.p99Ms > m.maxMs) {
      violations.push(`Violación de monotonía en percentiles para ruta '${m.route}' (concurrencia ${m.concurrency}).`);
    }

    // Cumplimiento SLO caliente
    if (m.p95Ms > CAPACITY_SLO_TARGETS.hotApiP95MaxMs) {
      violations.push(`Ruta '${m.route}' (concurrencia ${m.concurrency}) excedió SLO p95: ${m.p95Ms} ms > ${CAPACITY_SLO_TARGETS.hotApiP95MaxMs} ms.`);
    }
    if (m.p99Ms > CAPACITY_SLO_TARGETS.hotApiP99MaxMs) {
      violations.push(`Ruta '${m.route}' (concurrencia ${m.concurrency}) excedió SLO p99: ${m.p99Ms} ms > ${CAPACITY_SLO_TARGETS.hotApiP99MaxMs} ms.`);
    }

    // Conexiones por instancia
    if (m.maxObservedConnections > CAPACITY_SLO_TARGETS.maxConnectionsPerInstance) {
      violations.push(`Ruta '${m.route}' superó el máximo de conexiones por instancia: ${m.maxObservedConnections} > ${CAPACITY_SLO_TARGETS.maxConnectionsPerInstance}.`);
    }

    // Cero errores bajo admisión prevista
    if (m.errorsCount > 0) {
      violations.push(`Ruta '${m.route}' registró ${m.errorsCount} errores HTTP no esperados bajo carga.`);
    }
  }

  // 4. Separación de incumbencias: local comprobado vs proveedor pendiente
  if (report.separationOfConcerns.globalAcceptance !== false) {
    violations.push("El informe no puede declarar aceptación global: la evidencia del proveedor está pendiente del Ticket 31.");
  }
  if (!report.separationOfConcerns.providerPending) {
    violations.push("El informe debe marcar explícitamente que los límites reales del proveedor están pendientes del Ticket 31.");
  }
  if (report.separationOfConcerns.pendingExternalVerification.length === 0) {
    violations.push("El informe debe listar los ítems de verificación externa pendientes.");
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Regla de convergencia (D02, D03, D17, AUD-01):
 * Si las mediciones no sostienen los topes, se debe reducir la admisión o mejorar la capacidad con evidencia.
 * Está estrictamente prohibido subir el pool por intuición o contratar un plan pago sin justificación.
 */
export function convergencePolicy(measuredP95Ms: number, measuredP99Ms: number): {
  action: "MAINTAIN" | "REDUCE_ADMISSION";
  recommendation: string;
} {
  if (measuredP95Ms > CAPACITY_SLO_TARGETS.hotApiP95MaxMs || measuredP99Ms > CAPACITY_SLO_TARGETS.hotApiP99MaxMs) {
    return {
      action: "REDUCE_ADMISSION",
      recommendation:
        "Los percentiles medidos superan los objetivos SLO (p95 <= 750 ms, p99 <= 1500 ms). De acuerdo con D02 y D17, se debe reducir el techo de admisión de mutaciones (actualmente 10/min por sesión y 100/min global) o acotar lecturas privadas, en lugar de aumentar el pool por intuición o contratar un plan con costo.",
    };
  }
  return {
    action: "MAINTAIN",
    recommendation:
      "Los percentiles medidos cumplen holgadamente los objetivos SLO bajo concurrencia 8 y dataset completo. Se conserva el techo de admisión actual.",
  };
}

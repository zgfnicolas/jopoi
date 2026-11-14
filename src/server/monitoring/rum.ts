import {
  RUM_DEVICE_CLASSES,
  RUM_METRIC_NAMES,
  RUM_MIN_SAMPLE_COUNT,
  RUM_ROLLING_WINDOW_MS,
  RUM_ROUTES,
  RUM_THRESHOLDS,
  type RumConfirmation,
  type RumDeviceClass,
  type RumMetricCohortSummary,
  type RumMetricInput,
  type RumMetricName,
  type RumRating,
  type RumReport,
  type RumRoute,
} from "../../shared/rum-contracts";
import { ApplicationError } from "../application-error";

export class RateLimitError extends ApplicationError {
  readonly retryAfter: number;
  constructor(retryAfter: number) {
    super("RATE_LIMITED", undefined, { retryAfterSeconds: retryAfter });
    this.retryAfter = retryAfter;
  }
}

interface StoredRumSample {
  readonly value: number;
  readonly timestamp: number;
}

// Cohort key: route:device:metric
type CohortKey = `${RumRoute}:${RumDeviceClass}:${RumMetricName}`;

function cohortKey(route: RumRoute, device: RumDeviceClass, metric: RumMetricName): CohortKey {
  return `${route}:${device}:${metric}`;
}

const MAX_SAMPLES_PER_COHORT = 1000;
const rumStore = new Map<CohortKey, StoredRumSample[]>();

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const ipBuckets = new Map<string, RateLimitBucket>();
let globalBucket: RateLimitBucket = { count: 0, resetAt: Date.now() + 60000 };

export function resetRumRateLimitsForTests(): void {
  ipBuckets.clear();
  globalBucket = { count: 0, resetAt: Date.now() + 60000 };
}

/**
 * Control de tasa estricto para la ingesta RUM (AUD-11).
 * Máximo 60 peticiones/minuto por visitante y 1000 peticiones/minuto global.
 */
export function checkRumRateLimit(request: Request, now = Date.now()): void {
  // 1. Límite global (1000 por minuto)
  if (now > globalBucket.resetAt) {
    globalBucket = { count: 1, resetAt: now + 60000 };
  } else {
    globalBucket.count++;
    if (globalBucket.count > 1000) {
      const retryAfter = Math.max(1, Math.ceil((globalBucket.resetAt - now) / 1000));
      throw new RateLimitError(retryAfter);
    }
  }

  // 2. Límite por cliente (60 por minuto)
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? (forwarded.split(",")[0]?.trim() || "127.0.0.1") : "127.0.0.1";
  let bucket = ipBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 1, resetAt: now + 60000 };
    ipBuckets.set(ip, bucket);
  } else {
    bucket.count++;
    if (bucket.count > 60) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      throw new RateLimitError(retryAfter);
    }
  }
}

export function resetRumForTests(): void {
  rumStore.clear();
  resetRumRateLimitsForTests();
}

/**
 * Registra una muestra de rendimiento web con minimización estricta de datos (AUD-11, D13).
 */
export function recordRumMetric(
  input: RumMetricInput,
  nowTimestamp?: number,
): RumConfirmation {
  const timestamp = nowTimestamp ?? Date.now();
  const key = cohortKey(input.route, input.device, input.metric);

  let samples = rumStore.get(key);
  if (!samples) {
    samples = [];
    rumStore.set(key, samples);
  }

  // Descartar muestras fuera de la ventana móvil de 28 días
  const cutoff = timestamp - RUM_ROLLING_WINDOW_MS;
  if (samples.length > 0 && samples[0] && samples[0].timestamp < cutoff) {
    samples = samples.filter((s) => s.timestamp >= cutoff);
  }

  // Almacenar el valor numérico
  samples.push({ value: input.value, timestamp });

  // Si excede la capacidad máxima de memoria por cohorte, conservar las muestras más recientes
  if (samples.length > MAX_SAMPLES_PER_COHORT) {
    samples = samples.slice(samples.length - MAX_SAMPLES_PER_COHORT);
  }

  rumStore.set(key, samples);

  return {
    accepted: true,
    recordedAt: new Date(timestamp).toISOString(),
  };
}

/**
 * Obtiene los valores ordenados de una cohorte dentro de la ventana de 28 días.
 */
export function getCohortValues(
  route: RumRoute,
  device: RumDeviceClass,
  metric: RumMetricName,
  nowTimestamp?: number,
): number[] {
  const timestamp = nowTimestamp ?? Date.now();
  const key = cohortKey(route, device, metric);
  const samples = rumStore.get(key) ?? [];
  const cutoff = timestamp - RUM_ROLLING_WINDOW_MS;

  return samples
    .filter((s) => s.timestamp >= cutoff)
    .map((s) => s.value)
    .sort((a, b) => a - b);
}

/**
 * Calcula el percentil 75 siguiendo el estándar de Google Core Web Vitals.
 */
export function calculateP75(sortedValues: number[]): number | null {
  if (sortedValues.length === 0) return null;
  // Índice para el 75%
  const index = Math.min(
    Math.floor(sortedValues.length * 0.75),
    sortedValues.length - 1,
  );
  const raw = sortedValues[index] ?? 0;
  // Redondear a 2 decimales para CLS o números enteros para LCP/INP
  return Math.round(raw * 100) / 100;
}

function evaluateRating(metric: RumMetricName, p75: number): RumRating {
  const threshold = RUM_THRESHOLDS[metric];
  if (p75 <= threshold.good) return "good";
  if (p75 <= threshold.needsImprovement) return "needs-improvement";
  return "poor";
}

/**
 * Genera el informe consolidado de RUM (AUD-11, S22-26).
 * Exige al menos 200 muestras válidas por cohorte (ruta + dispositivo + métrica)
 * para emitir un juicio de cumplimiento.
 * NUNCA promedia ni agrupa rutas para ocultar regresiones.
 * NUNCA utiliza TBT como sustituto de INP.
 */
export function generateRumReport(
  now: Date = new Date(),
  minSamplesRequired: number = RUM_MIN_SAMPLE_COUNT,
): RumReport {
  const timestamp = now.getTime();
  const cohorts: RumMetricCohortSummary[] = [];

  let totalSamples = 0;
  let sufficientCohorts = 0;
  let passingCohorts = 0;

  for (const route of RUM_ROUTES) {
    for (const device of RUM_DEVICE_CLASSES) {
      for (const metric of RUM_METRIC_NAMES) {
        const values = getCohortValues(route, device, metric, timestamp);
        const count = values.length;
        totalSamples += count;

        const target = RUM_THRESHOLDS[metric].good;
        const hasSufficientData = count >= minSamplesRequired;

        if (hasSufficientData) {
          sufficientCohorts++;
          const p75 = calculateP75(values);
          const withinTarget = p75 !== null && p75 <= target;
          if (withinTarget) passingCohorts++;

          cohorts.push({
            metric,
            route,
            device,
            sampleCount: count,
            requiredSamples: minSamplesRequired,
            hasSufficientData: true,
            status: "SUFFICIENT_DATA",
            p75,
            target,
            withinTarget,
            rating: p75 !== null ? evaluateRating(metric, p75) : "poor",
          });
        } else {
          cohorts.push({
            metric,
            route,
            device,
            sampleCount: count,
            requiredSamples: minSamplesRequired,
            hasSufficientData: false,
            status: "INSUFFICIENT_DATA",
            p75: null,
            target,
            withinTarget: null,
            rating: "insufficient_data",
            note: `Evidencia insuficiente: se registraron ${count} de las ${minSamplesRequired} muestras requeridas en la ventana móvil de 28 días.`,
          });
        }
      }
    }
  }

  const overallCompliant =
    sufficientCohorts > 0 && sufficientCohorts === passingCohorts
      ? true
      : sufficientCohorts > 0 && passingCohorts < sufficientCohorts
        ? false
        : null;

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    windowDays: 28,
    minSamplesRequired,
    inpIsLaboratoryTbt: false,
    cohorts,
    summary: {
      totalSamples,
      totalCohorts: cohorts.length,
      sufficientCohorts,
      passingCohorts,
      overallCompliant,
    },
  };
}

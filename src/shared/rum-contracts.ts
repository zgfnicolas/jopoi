import { z } from "zod";

export const RUM_METRIC_NAMES = ["LCP", "INP", "CLS"] as const;
export type RumMetricName = (typeof RUM_METRIC_NAMES)[number];

export const RUM_ROUTES = ["/", "/demo", "/trazabilidad/:traceId", "other"] as const;
export type RumRoute = (typeof RUM_ROUTES)[number];

export const RUM_DEVICE_CLASSES = ["desktop", "mobile", "tablet"] as const;
export type RumDeviceClass = (typeof RUM_DEVICE_CLASSES)[number];

export const RUM_RATINGS = ["good", "needs-improvement", "poor"] as const;
export type RumRating = (typeof RUM_RATINGS)[number];

export const RUM_CONNECTION_TYPES = ["4g", "3g", "2g", "slow-2g", "unknown"] as const;
export type RumConnectionType = (typeof RUM_CONNECTION_TYPES)[number];

/**
 * Umbrales estándar de Core Web Vitals (Google / W3C):
 * - LCP: <= 2500 ms (bueno), <= 4000 ms (a mejorar), > 4000 ms (pobre)
 * - INP: <= 200 ms (bueno), <= 500 ms (a mejorar), > 500 ms (pobre)
 * - CLS: <= 0.10 (bueno), <= 0.25 (a mejorar), > 0.25 (pobre)
 */
export const RUM_THRESHOLDS = Object.freeze({
  LCP: { good: 2500, needsImprovement: 4000 },
  INP: { good: 200, needsImprovement: 500 },
  CLS: { good: 0.10, needsImprovement: 0.25 },
} as const);

export const RUM_MIN_SAMPLE_COUNT = 200;
export const RUM_ROLLING_WINDOW_DAYS = 28;
export const RUM_ROLLING_WINDOW_MS = 28 * 24 * 60 * 60 * 1000;

/**
 * Esquema estricto de entrada RUM (AUD-11, D13).
 * Minimización radical de datos:
 * Solo métrica, valor numérico, ruta plantilla y clase de dispositivo.
 * Prohíbe URLs libres, parámetros de búsqueda, IDs/UUIDs de recorrido,
 * credenciales o datos de contacto.
 */
export const rumMetricInputSchema = z.strictObject({
  metric: z.enum(RUM_METRIC_NAMES),
  value: z.number().nonnegative().finite(),
  route: z.enum(RUM_ROUTES),
  device: z.enum(RUM_DEVICE_CLASSES),
  version: z.string().min(1).max(32),
  rating: z.enum(RUM_RATINGS).optional(),
  connection: z.enum(RUM_CONNECTION_TYPES).optional(),
});
export type RumMetricInput = z.infer<typeof rumMetricInputSchema>;

export const rumConfirmationSchema = z.strictObject({
  accepted: z.literal(true),
  recordedAt: z.iso.datetime({ precision: 3 }),
});
export type RumConfirmation = z.infer<typeof rumConfirmationSchema>;

export interface RumMetricCohortSummary {
  readonly metric: RumMetricName;
  readonly route: RumRoute;
  readonly device: RumDeviceClass;
  readonly sampleCount: number;
  readonly requiredSamples: number;
  readonly hasSufficientData: boolean;
  readonly status: "SUFFICIENT_DATA" | "INSUFFICIENT_DATA";
  readonly p75: number | null;
  readonly target: number;
  readonly withinTarget: boolean | null;
  readonly rating: RumRating | "insufficient_data";
  readonly note?: string;
}

export interface RumReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly windowDays: number;
  readonly minSamplesRequired: number;
  readonly inpIsLaboratoryTbt: false;
  readonly cohorts: readonly RumMetricCohortSummary[];
  readonly summary: {
    readonly totalSamples: number;
    readonly totalCohorts: number;
    readonly sufficientCohorts: number;
    readonly passingCohorts: number;
    readonly overallCompliant: boolean | null;
  };
}

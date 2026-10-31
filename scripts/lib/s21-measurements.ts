import { z } from "zod";

export const measurementSchema = z.object({
  route: z.string().min(1), concurrency: z.number().int().positive(), repetition: z.number().int().positive(),
  p50: z.number().finite().nonnegative(), p95: z.number().finite().nonnegative(), errors: z.number().int().nonnegative(),
});
export const benchmarkSchema = z.object({ measurements: z.array(measurementSchema).min(1) });

export function percentile(values: readonly number[], index: number): number {
  const value = values[index];
  if (value === undefined || !Number.isFinite(value) || value < 0) throw new Error("S21_MEASUREMENT_INCOMPLETE");
  return value;
}

/** No completes con ceros: una consulta sin fila no demuestra salud ni rendimiento. */
export function diagnosticRow<T>(rows: readonly unknown[], schema: z.ZodType<T>): T {
  return schema.parse(rows[0]);
}

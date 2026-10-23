import { formatFixedDecimal, normalizeHumidityPercent, parseFixedDecimal, parseOperationQuantityGrams } from "../../domain/decimal";
import type { DomainResult } from "../../domain/result";

export function toStoredGrams(value: unknown, field = "quantityKg"): DomainResult<bigint> {
  return parseOperationQuantityGrams(value, field);
}

export function toStoredHumidity(value: unknown): DomainResult<number> {
  const normalized = normalizeHumidityPercent(value);
  if (!normalized.ok) return normalized;
  const parsed = parseFixedDecimal(normalized.value, 2, "humidityPercent");
  // El rango 0..10000 es entero y exactamente representable como Number/SMALLINT.
  return parsed.ok ? { ok: true, value: Number(parsed.value) } : parsed;
}

export function fromStoredGrams(grams: bigint): string {
  return formatFixedDecimal(grams, 3);
}

export function fromStoredHumidity(hundredths: number): string {
  return formatFixedDecimal(BigInt(hundredths), 2);
}

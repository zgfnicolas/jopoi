import { formatFixedDecimal, normalizeHumidityPercent, parseFixedDecimal, parseQuantityGrams } from "../../domain/decimal";
import { invalidField, type DomainResult } from "../../domain/result";

const MAX_POSTGRES_BIGINT = 9223372036854775807n;

export function toStoredGrams(value: unknown, field = "quantityKg"): DomainResult<bigint> {
  const parsed = parseQuantityGrams(value, field);
  if (!parsed.ok) return parsed;
  return parsed.value <= MAX_POSTGRES_BIGINT
    ? parsed
    : invalidField(field, "La cantidad supera el rango de almacenamiento.", "RULE_VIOLATION");
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

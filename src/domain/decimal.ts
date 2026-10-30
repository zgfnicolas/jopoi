import { invalidField, type DomainResult } from "./result";

/** Rango operativo acordado con S03, expresado en gramos enteros. */
export const MAX_OPERATION_GRAMS = 9223372036854775807n;

/** No acepta exponentes, separadores locales, signos ni precisión adicional. */
export function parseFixedDecimal(
  input: unknown,
  scale: 2 | 3,
  field: string,
): DomainResult<bigint> {
  if (typeof input !== "string" || !/^\d+(?:\.\d+)?$/.test(input)) {
    return invalidField(field, "Ingresá una cadena decimal sin signo y con punto decimal.");
  }

  const [whole, fraction = ""] = input.split(".");
  if (whole === undefined) return invalidField(field, "Ingresá una parte entera válida.");
  if (fraction.length > scale) {
    return invalidField(field, `Se admiten hasta ${scale} decimales, sin redondeo.`);
  }

  return {
    ok: true,
    value: BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0")),
  };
}

/** Formato canónico exacto; no convierte el entero a Number. */
export function formatFixedDecimal(value: bigint, scale: 2 | 3): string {
  const factor = 10n ** BigInt(scale);
  const magnitude = value < 0n ? -value : value;
  const fraction = (magnitude % factor).toString().padStart(scale, "0");
  return `${value < 0n ? "-" : ""}${magnitude / factor}.${fraction}`;
}

/** Gramos exactos, solo para aritmética interna: no serializar bigint como JSON. */
export function parseQuantityGrams(
  quantityKg: unknown,
  field = "quantityKg",
): DomainResult<bigint> {
  const parsed = parseFixedDecimal(quantityKg, 3, field);
  if (!parsed.ok) return parsed;
  return parsed.value > 0n
    ? parsed
    : invalidField(field, "La cantidad debe ser positiva.", "RULE_VIOLATION");
}

export function normalizeQuantityKg(
  quantityKg: unknown,
  field = "quantityKg",
): DomainResult<string> {
  const parsed = parseQuantityGrams(quantityKg, field);
  return parsed.ok ? { ok: true, value: formatFixedDecimal(parsed.value, 3) } : parsed;
}

export function parseOperationQuantityGrams(value: unknown, field = "quantityKg"): DomainResult<bigint> {
  const parsed = parseQuantityGrams(value, field);
  if (!parsed.ok) return parsed;
  return parsed.value <= MAX_OPERATION_GRAMS
    ? parsed
    : invalidField(field, "La cantidad supera el rango de almacenamiento.", "RULE_VIOLATION");
}

export function parseHumidityHundredths(humidityPercent: unknown, field = "humidityPercent"): DomainResult<bigint> {
  const parsed = parseFixedDecimal(humidityPercent, 2, field);
  if (!parsed.ok) return parsed;
  if (parsed.value > 10000n) {
    return invalidField(field, "La humedad debe estar entre 0 y 100%.", "RULE_VIOLATION");
  }
  return parsed;
}

export function normalizeHumidityPercent(humidityPercent: unknown): DomainResult<string> {
  const parsed = parseHumidityHundredths(humidityPercent);
  return parsed.ok ? { ok: true, value: formatFixedDecimal(parsed.value, 2) } : parsed;
}

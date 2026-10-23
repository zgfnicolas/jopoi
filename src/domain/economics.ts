import { formatFixedDecimal, parseFixedDecimal, parseQuantityGrams } from "./decimal";
import { invalidField, type DomainResult } from "./result";
import type { ScenarioPricing } from "./scenario-types";

export interface EconomicsSummary {
  readonly currency: "ARS";
  readonly isIllustrative: true;
  readonly disclaimer: string;
  readonly quantityKg: string;
  readonly materialCost: string;
  readonly returnFreight: string;
  readonly jopoiFee: string;
  readonly jopoiTotal: string;
  readonly dedicatedFreight: string;
  readonly alternativeTotal: string;
  readonly difference: string;
  readonly differenceKind: "saving" | "extra_cost" | "equal";
}

const GRAMS_PER_TONNE = 1000000n;

/** Usa siempre precios del snapshot del recorrido, nunca el catálogo vigente. */
export function calculateEconomics(
  quantityKg: unknown,
  pricingSnapshot: ScenarioPricing,
): DomainResult<EconomicsSummary> {
  const quantity = parseQuantityGrams(quantityKg);
  if (!quantity.ok) return quantity;
  if (pricingSnapshot.currency !== "ARS") {
    return invalidField("pricing.currency", "La moneda de esta demostración es ARS.");
  }

  const materialRate = parseFixedDecimal(pricingSnapshot.materialPerTonne, 2, "pricing.materialPerTonne");
  if (!materialRate.ok) return materialRate;
  const returnFreight = parseFixedDecimal(pricingSnapshot.returnFreight, 2, "pricing.returnFreight");
  if (!returnFreight.ok) return returnFreight;
  const fee = parseFixedDecimal(pricingSnapshot.jopoiFee, 2, "pricing.jopoiFee");
  if (!fee.ok) return fee;
  const dedicatedFreight = parseFixedDecimal(pricingSnapshot.dedicatedFreight, 2, "pricing.dedicatedFreight");
  if (!dedicatedFreight.ok) return dedicatedFreight;

  // HALF_UP para importes no negativos, una sola vez sobre el costo del material.
  const materialCost = (quantity.value * materialRate.value + GRAMS_PER_TONNE / 2n) / GRAMS_PER_TONNE;
  const jopoiTotal = materialCost + returnFreight.value + fee.value;
  const alternativeTotal = materialCost + dedicatedFreight.value;
  const difference = alternativeTotal - jopoiTotal;

  return {
    ok: true,
    value: {
      currency: "ARS",
      isIllustrative: true,
      disclaimer: "Importes y diferencia ilustrativos. No son cotizaciones, márgenes netos ni resultados observados.",
      quantityKg: formatFixedDecimal(quantity.value, 3),
      materialCost: formatFixedDecimal(materialCost, 2),
      returnFreight: formatFixedDecimal(returnFreight.value, 2),
      jopoiFee: formatFixedDecimal(fee.value, 2),
      jopoiTotal: formatFixedDecimal(jopoiTotal, 2),
      dedicatedFreight: formatFixedDecimal(dedicatedFreight.value, 2),
      alternativeTotal: formatFixedDecimal(alternativeTotal, 2),
      difference: formatFixedDecimal(difference, 2),
      differenceKind: difference > 0n ? "saving" : difference < 0n ? "extra_cost" : "equal",
    },
  };
}

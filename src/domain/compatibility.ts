import type { TripCompatibility, TripCompatibilityCheck } from "../shared/operation-contracts";
import { formatFixedDecimal, parseFixedDecimal, parseOperationQuantityGrams } from "./decimal";
import { invalidField, type DomainResult } from "./result";
import type { ExamplePickupWindow, ScenarioSnapshot } from "./scenario-types";

function windowInterval(window: ExamplePickupWindow, field: string): DomainResult<{ start: bigint; end: bigint }> {
  if (!Number.isSafeInteger(window.dayOffset) || window.dayOffset < 0
    || !Number.isInteger(window.startMinute) || !Number.isInteger(window.endMinute)
    || window.startMinute < 0 || window.endMinute > 1440 || window.startMinute >= window.endMinute
    || window.utcOffset !== "-03:00") {
    return invalidField(field, "La ventana debe tener un día y minutos válidos con el offset ilustrativo UTC−03:00.");
  }
  const day = BigInt(window.dayOffset) * 1440n;
  // UTC−03:00: sumar 180 minutos para comparar instantes en el eje UTC ilustrativo.
  return { ok: true, value: { start: day + BigInt(window.startMinute) + 180n, end: day + BigInt(window.endMinute) + 180n } };
}

/** Evalúa todos los viajes del snapshot del recorrido, en su orden original. */
export function evaluateTripCompatibility(quantityKg: unknown, snapshot: ScenarioSnapshot): DomainResult<readonly TripCompatibility[]> {
  const quantity = parseOperationQuantityGrams(quantityKg);
  if (!quantity.ok) return quantity;
  const requiredWindow = windowInterval(snapshot.initialLot.requiredPickupWindow, "requiredPickupWindow");
  if (!requiredWindow.ok) return requiredWindow;
  const results: TripCompatibility[] = [];
  for (const trip of snapshot.trips) {
    // La capacidad disponible puede ser cero: no es una cantidad de lote positiva.
    const capacity = parseFixedDecimal(trip.availableCapacityKg, 3, "availableCapacityKg");
    if (!capacity.ok) return capacity;
    const availableWindow = windowInterval(trip.pickupWindow, "pickupWindow");
    if (!availableWindow.ok) return availableWindow;
    const material = snapshot.buyer.acceptedMaterialIds.includes(snapshot.material.id)
      && trip.acceptedMaterialIds.includes(snapshot.material.id);
    const body = snapshot.initialLot.requiredBodyTypes.includes(trip.bodyType);
    const route = trip.routeCompatible && trip.routeId === snapshot.route.id;
    const overlap = availableWindow.value.start < requiredWindow.value.end && requiredWindow.value.start < availableWindow.value.end;
    const checks: readonly TripCompatibilityCheck[] = Object.freeze([
      Object.freeze({ code: "MATERIAL", isCompatible: material, message: material
        ? "El comprador y el viaje admiten el material declarado."
        : "El material no es admitido por el comprador o por el viaje." }),
      Object.freeze({ code: "CAPACITY", isCompatible: capacity.value >= quantity.value,
        message: `Capacidad disponible: ${formatFixedDecimal(capacity.value, 3)} kg; cantidad declarada: ${formatFixedDecimal(quantity.value, 3)} kg.` }),
      Object.freeze({ code: "BODY_TYPE", isCompatible: body, message: body
        ? "La carrocería del viaje es adecuada para este lote."
        : "La carrocería del viaje no es adecuada para este lote." }),
      Object.freeze({ code: "ROUTE", isCompatible: route, message: route
        ? "El viaje corresponde al corredor del escenario."
        : "La ruta del viaje no es compatible con el corredor del escenario." }),
      Object.freeze({ code: "PICKUP_WINDOW", isCompatible: overlap, message: overlap
        ? "Los horarios de retiro comparten un intervalo disponible."
        : "Los horarios de retiro no comparten un intervalo de duración positiva." }),
    ]);
    results.push(Object.freeze({ tripId: trip.id, isCompatible: checks.every((check) => check.isCompatible), checks }));
  }
  return { ok: true, value: Object.freeze(results) };
}

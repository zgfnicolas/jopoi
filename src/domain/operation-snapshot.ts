import { z } from "zod";
import type { OperationSnapshot } from "../shared/operation-snapshot";
import { evaluateTripCompatibility } from "./compatibility";
import { parseHumidityHundredths } from "./decimal";
import { eventHumidity, eventQuantity, eventText } from "./event-schemas";
import { invalidField, type DomainResult } from "./result";
import { snapshotSchema } from "./scenario-schema";
import type { ScenarioSnapshot } from "./scenario-types";

// El máximo int64 en gramos ocupa 20 caracteres en kg: cortá antes de convertir a bigint.
const quantity = z.string().max(20).pipe(eventQuantity);
const humidity = z.string().max(6).pipe(eventHumidity);
const declared = { quantityKg: quantity, humidityPercent: humidity };
const unassigned = { assignedBuyerId: z.null(), assignedTripId: z.null() };
const assigned = { assignedBuyerId: eventText, assignedTripId: eventText };
const open = { receivedKg: z.null(), rejectionReasonCode: z.null(), incidentReasonCode: z.null() };

// No exportes una validación de forma como si acreditara coherencia con el escenario.
const shape: z.ZodType<OperationSnapshot> = z
  .discriminatedUnion("state", [
    z.strictObject({ state: z.literal("DRAFT"), ...declared, ...unassigned, ...open }),
    z.strictObject({ state: z.literal("PUBLISHED"), ...declared, ...unassigned, ...open }),
    z.strictObject({ state: z.literal("APPROVED"), ...declared, ...unassigned, ...open }),
    z.strictObject({ state: z.literal("ASSIGNED"), ...declared, ...assigned, ...open }),
    z.strictObject({ state: z.literal("PICKED_UP"), ...declared, ...assigned, ...open }),
    z.strictObject({
      state: z.literal("RECEIVED"),
      ...declared,
      ...assigned,
      receivedKg: quantity,
      rejectionReasonCode: z.null(),
      incidentReasonCode: z.null(),
    }),
    z.strictObject({
      state: z.literal("REJECTED"),
      ...declared,
      ...unassigned,
      receivedKg: z.null(),
      rejectionReasonCode: eventText,
      incidentReasonCode: z.null(),
    }),
    z.strictObject({
      state: z.literal("INCIDENT"),
      ...declared,
      ...assigned,
      receivedKg: quantity,
      rejectionReasonCode: z.null(),
      incidentReasonCode: eventText,
    }),
  ])
  .readonly();

function hasUniqueCatalogs(snapshot: ScenarioSnapshot): boolean {
  return [
    snapshot.trips.map((item) => item.id),
    snapshot.rejectionReasons.map((item) => item.code),
    snapshot.incidentReasons.map((item) => item.code),
  ].every((ids) => new Set(ids).size === ids.length);
}

function coherentWithScenario(operation: OperationSnapshot, snapshot: ScenarioSnapshot): boolean {
  const humidity = parseHumidityHundredths(operation.humidityPercent);
  const maximum = parseHumidityHundredths(snapshot.buyer.maximumHumidityPercent);
  if (!humidity.ok || !maximum.ok) return false;

  if (
    ["APPROVED", "ASSIGNED", "PICKED_UP", "RECEIVED", "INCIDENT"].includes(operation.state) &&
    humidity.value > maximum.value
  )
    return false;

  if (operation.assignedBuyerId !== null) {
    if (operation.assignedBuyerId !== snapshot.buyer.id) return false;
    const compatibility = evaluateTripCompatibility(operation.quantityKg, snapshot);
    if (
      !compatibility.ok ||
      !compatibility.value.some((trip) => trip.tripId === operation.assignedTripId && trip.isCompatible)
    )
      return false;
  }

  switch (operation.state) {
    case "RECEIVED":
      // Ambas cantidades ya son canónicas: igualdad de cadenas equivale a igualdad exacta de gramos.
      return operation.receivedKg === operation.quantityKg;
    case "REJECTED":
      return (
        snapshot.rejectionReasons.some((reason) => reason.code === operation.rejectionReasonCode) &&
        (operation.rejectionReasonCode !== "HUMIDITY_ABOVE_LIMIT" || humidity.value > maximum.value)
      );
    case "INCIDENT":
      return (
        snapshot.incidentReasons.some((reason) => reason.code === operation.incidentReasonCode) &&
        (operation.incidentReasonCode !== "WEIGHT_MISMATCH" || operation.receivedKg !== operation.quantityKg)
      );
    default:
      return true;
  }
}

/** Frontera de reconstrucción: tratá JSON y contexto como desconocidos y rechazá inconsistencias sin fabricar datos. */
export function reconstructOperationSnapshot(input: unknown, scenario: unknown): DomainResult<OperationSnapshot> {
  const context = snapshotSchema.safeParse(scenario);
  if (!context.success || !hasUniqueCatalogs(context.data)) {
    return invalidField("scenario", "El escenario no permite reconstruir una operación coherente.");
  }
  const parsed = shape.safeParse(input);
  if (!parsed.success || !coherentWithScenario(parsed.data, context.data)) {
    return invalidField("operation", "Los datos de la operación no corresponden a su estado y escenario.");
  }
  return { ok: true, value: parsed.data };
}

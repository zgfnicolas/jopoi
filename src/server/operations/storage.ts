import "server-only";

import { z } from "zod";
import { Prisma, type DemoRun } from "../../generated/prisma/client";
import { canonicalJson } from "../../domain/canonical-json";
import { eventHumidity, eventQuantity, eventText, eventUuid, operationDataSchema } from "../../domain/event-schemas";
import type { ScenarioSnapshot } from "../../domain/scenario-types";
import type { OperationAction, OperationData } from "../../shared/operation-contracts";
import { ApplicationError } from "../application-error";
import { fromStoredGrams, fromStoredHumidity, toStoredGrams, toStoredHumidity } from "../database/precision";

const company = z.strictObject({ id: eventText, name: eventText, isFictitious: z.literal(true) });
const body = z.enum(["BULK_TIPPER", "ENCLOSED_VAN"]);
const window = z.strictObject({ dayOffset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440), utcOffset: z.literal("-03:00") })
  .refine((value) => value.startMinute < value.endMinute);
const reason = z.strictObject({ code: eventText, label: eventText });
const money = z.string().regex(/^(0|[1-9]\d*)\.\d{2}$/);
const capacity = z.string().regex(/^(0|[1-9]\d*)\.\d{3}$/);
const asset = z.strictObject({
  id: eventText, kind: eventText, localPath: eventText, mediaType: eventText,
  width: z.number().int().positive(), height: z.number().int().positive(), author: eventText,
  sourceUrl: eventText.nullable(), downloadUrl: eventText.nullable(), license: eventText, licenseUrl: eventText.nullable(),
  obtainedOn: eventText, changes: eventText, attribution: eventText, alt: eventText, caption: eventText,
  referenceQuantityKg: eventQuantity.nullable(),
});
const snapshotSchema: z.ZodType<ScenarioSnapshot> = z.strictObject({
  version: eventText, isIllustrative: z.literal(true), disclaimer: eventText,
  material: z.strictObject({ id: eventText, label: eventText, description: eventText }), generator: company,
  buyer: company.extend({ maximumHumidityPercent: eventHumidity, acceptedMaterialIds: z.array(eventText).min(1) }),
  route: z.strictObject({ id: eventText, label: eventText, origin: eventText, destination: eventText, distanceKm: capacity }),
  initialLot: z.strictObject({ quantityKg: eventQuantity, humidityPercent: eventHumidity,
    requiredBodyTypes: z.array(body).min(1), requiredPickupWindow: window }),
  trips: z.array(z.strictObject({ id: eventText, label: eventText, carrier: company, isReturnTrip: z.boolean(),
    acceptedMaterialIds: z.array(eventText), availableCapacityKg: capacity, bodyType: body,
    routeId: eventText, routeCompatible: z.boolean(), pickupWindow: window })),
  pricing: z.strictObject({ currency: z.literal("ARS"), materialPerTonne: money, returnFreight: money, jopoiFee: money, dedicatedFreight: money }),
  rejectionReasons: z.array(reason), incidentReasons: z.array(reason), assets: z.array(asset),
});

export const receiptResultSchema = z.strictObject({ version: z.literal(1), operation: operationDataSchema, eventId: eventUuid.nullable() });

export function readRunSnapshot(run: Pick<DemoRun, "scenarioSnapshot" | "scenarioVersion">): ScenarioSnapshot {
  const parsed = snapshotSchema.safeParse(run.scenarioSnapshot);
  if (!parsed.success || parsed.data.version !== run.scenarioVersion) throw new ApplicationError("INTERNAL_ERROR");
  const snapshot = parsed.data;
  // Los IDs usados para seleccionar elementos deben ser inequívocos dentro de cada catálogo.
  for (const ids of [snapshot.trips.map((item) => item.id), snapshot.rejectionReasons.map((item) => item.code), snapshot.incidentReasons.map((item) => item.code)]) {
    if (new Set(ids).size !== ids.length) throw new ApplicationError("INTERNAL_ERROR");
  }
  return snapshot;
}

export function readRunOperation(run: DemoRun): OperationData {
  const parsed = operationDataSchema.safeParse({
    state: run.state, quantityKg: fromStoredGrams(run.declaredGrams), humidityPercent: fromStoredHumidity(run.humidityHundredths),
    assignedBuyerId: run.assignedBuyerId, assignedTripId: run.assignedTripId,
    receivedKg: run.receivedGrams === null ? null : fromStoredGrams(run.receivedGrams),
    rejectionReasonCode: run.rejectionReasonCode, incidentReasonCode: run.incidentReasonCode,
  });
  if (!parsed.success) throw new ApplicationError("INTERNAL_ERROR");
  return parsed.data;
}

export function runChanges(operation: OperationData, action: OperationAction, appliedAt: Date): Prisma.DemoRunUpdateInput {
  const declared = toStoredGrams(operation.quantityKg);
  const humidity = toStoredHumidity(operation.humidityPercent);
  const received = operation.receivedKg === null ? null : toStoredGrams(operation.receivedKg, "receivedKg");
  if (!declared.ok || !humidity.ok || (received !== null && !received.ok)) throw new ApplicationError("INTERNAL_ERROR");
  return {
    state: operation.state, declaredGrams: declared.value, humidityHundredths: humidity.value,
    assignedBuyerId: operation.assignedBuyerId, assignedTripId: operation.assignedTripId,
    ...(action === "assign" ? { assignedAt: appliedAt } : {}),
    receivedGrams: received === null ? null : received.value,
    rejectionReasonCode: operation.rejectionReasonCode, incidentReasonCode: operation.incidentReasonCode,
  };
}

/** La canonicalización comprueba que el objeto no contiene valores omitibles o no JSON. */
export function jsonObject(value: object): Prisma.InputJsonObject {
  if (Array.isArray(value)) throw new ApplicationError("INTERNAL_ERROR");
  return JSON.parse(canonicalJson(value)) as Prisma.InputJsonObject;
}

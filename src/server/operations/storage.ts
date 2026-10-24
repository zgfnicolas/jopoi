import "server-only";

import { z } from "zod";
import { Prisma, type DemoRun } from "../../generated/prisma/client";
import { canonicalJson } from "../../domain/canonical-json";
import { eventUuid, operationDataSchema } from "../../domain/event-schemas";
import { snapshotSchema } from "../../domain/scenario-schema";
import type { ScenarioSnapshot } from "../../domain/scenario-types";
import type { OperationAction, OperationData } from "../../shared/operation-contracts";
import { ApplicationError } from "../application-error";
import { fromStoredGrams, fromStoredHumidity, toStoredGrams, toStoredHumidity } from "../database/precision";

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

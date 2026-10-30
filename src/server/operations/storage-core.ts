import { z } from "zod";
import type { DemoRun } from "../../generated/prisma/client";

import { eventUuid, operationDataSchema } from "../../domain/event-schemas";
import { snapshotSchema } from "../../domain/scenario-schema";
import type { ScenarioSnapshot } from "../../domain/scenario-types";

import type { OperationSnapshot } from "../../shared/operation-snapshot";
import { reconstructOperationSnapshot } from "../../domain/operation-snapshot";
import { ApplicationError } from "../application-error";
import { fromStoredGrams, fromStoredHumidity } from "../database/precision";

export const receiptResultSchema = z.strictObject({ version: z.literal(1), operation: operationDataSchema, eventId: eventUuid.nullable() });

export function readStoredOperation(value: unknown, snapshot: ScenarioSnapshot): OperationSnapshot {
  const result = reconstructOperationSnapshot(value, snapshot);
  if (!result.ok) throw new ApplicationError("INTERNAL_ERROR");
  return result.value;
}

export function readReceiptResult(value: unknown, snapshot: ScenarioSnapshot) {
  const parsed = receiptResultSchema.safeParse(value);
  if (!parsed.success) throw new ApplicationError("INTERNAL_ERROR");
  return { ...parsed.data, operation: readStoredOperation(parsed.data.operation, snapshot) };
}

export function readRunSnapshot(run: { readonly scenarioSnapshot: unknown; readonly scenarioVersion: string }): ScenarioSnapshot {
  const parsed = snapshotSchema.safeParse(run.scenarioSnapshot);
  if (!parsed.success || parsed.data.version !== run.scenarioVersion) throw new ApplicationError("INTERNAL_ERROR");
  const snapshot = parsed.data;
  // Evitá IDs repetidos: la selección de viajes y motivos debe ser inequívoca.
  for (const ids of [snapshot.trips.map((item) => item.id), snapshot.rejectionReasons.map((item) => item.code), snapshot.incidentReasons.map((item) => item.code)]) {
    if (new Set(ids).size !== ids.length) throw new ApplicationError("INTERNAL_ERROR");
  }
  return snapshot;
}

export type StoredRun = Pick<DemoRun, "scenarioVersion" | "state" | "declaredGrams" | "humidityHundredths"
  | "assignedBuyerId" | "assignedTripId" | "assignedAt" | "receivedGrams" | "rejectionReasonCode" | "incidentReasonCode"> & { readonly scenarioSnapshot: unknown };

export function readRunOperation(run: StoredRun, snapshot: ScenarioSnapshot = readRunSnapshot(run)): OperationSnapshot {
  if ((run.assignedBuyerId === null) !== (run.assignedAt === null)) throw new ApplicationError("INTERNAL_ERROR");
  return readStoredOperation({
    state: run.state, quantityKg: fromStoredGrams(run.declaredGrams), humidityPercent: fromStoredHumidity(run.humidityHundredths),
    assignedBuyerId: run.assignedBuyerId, assignedTripId: run.assignedTripId,
    receivedKg: run.receivedGrams === null ? null : fromStoredGrams(run.receivedGrams),
    rejectionReasonCode: run.rejectionReasonCode, incidentReasonCode: run.incidentReasonCode,
  }, snapshot);
}

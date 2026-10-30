import "server-only";
import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { canonicalJson } from "../../domain/canonical-json";
import type { OperationAction } from "../../shared/operation-contracts";
import type { OperationSnapshot } from "../../shared/operation-snapshot";
import { ApplicationError } from "../application-error";
import { toStoredGrams, toStoredHumidity } from "../database/precision";
export { readStoredOperation, readReceiptResult, readRunSnapshot, readRunOperation } from "./storage-core";
export function runChanges(operation: OperationSnapshot, action: OperationAction, appliedAt: Date): Prisma.DemoRunUpdateInput {
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

/** Validá el JSON antes de persistirlo para evitar omisiones silenciosas. */
export function jsonObject(value: object): Prisma.InputJsonObject {
  if (Array.isArray(value)) throw new ApplicationError("INTERNAL_ERROR");
  return z.record(z.string(), z.json()).parse(JSON.parse(canonicalJson(value)));
}

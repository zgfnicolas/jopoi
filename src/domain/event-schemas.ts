import { z } from "zod";
import type { HcsEventEnvelope, PublicEventPayload, PublicEventType } from "../shared/event-contracts";
import type { OperationData, OperationState, SimulatedRole } from "../shared/operation-contracts";
import { formatFixedDecimal, parseHumidityHundredths, parseOperationQuantityGrams } from "./decimal";

export const eventUuid = z.uuid().refine((value) => value === value.toLowerCase());
export const eventText = z.string().min(1).refine((value) => value.isWellFormed() && !value.includes("\u0000"));
export const eventQuantity = z.string().refine((value) => {
  const parsed = parseOperationQuantityGrams(value);
  return parsed.ok && formatFixedDecimal(parsed.value, 3) === value;
});
export const eventHumidity = z.string().refine((value) => {
  const parsed = parseHumidityHundredths(value);
  return parsed.ok && formatFixedDecimal(parsed.value, 2) === value;
});
export const eventState = z.enum(["DRAFT", "PUBLISHED", "APPROVED", "ASSIGNED", "PICKED_UP", "RECEIVED", "REJECTED", "INCIDENT"]);
export const eventRole = z.enum(["generator", "coordinator", "carrier", "buyer"]);
export const eventType = z.enum(["LOT_PUBLISHED", "LOT_APPROVED", "LOT_REJECTED", "TRANSPORT_ASSIGNED", "PICKUP_CONFIRMED", "RECEIPT_ACCEPTED", "RECEIPT_ISSUE_REPORTED"]);
export const eventDigest = z.string().regex(/^[a-f0-9]{64}$/);
const ordinal = z.number().int().positive().max(2147483647);
const appliedAt = z.string().refine((value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);

export const operationDataSchema: z.ZodType<OperationData> = z.strictObject({
  state: eventState, quantityKg: eventQuantity, humidityPercent: eventHumidity,
  assignedBuyerId: eventText.nullable(), assignedTripId: eventText.nullable(), receivedKg: eventQuantity.nullable(),
  rejectionReasonCode: eventText.nullable(), incidentReasonCode: eventText.nullable(),
});

const semantics: Record<PublicEventType, { state: OperationState; role: SimulatedRole; trip: boolean; received: boolean; reason: boolean }> = {
  LOT_PUBLISHED: { state: "PUBLISHED", role: "generator", trip: false, received: false, reason: false },
  LOT_APPROVED: { state: "APPROVED", role: "coordinator", trip: false, received: false, reason: false },
  LOT_REJECTED: { state: "REJECTED", role: "coordinator", trip: false, received: false, reason: true },
  TRANSPORT_ASSIGNED: { state: "ASSIGNED", role: "coordinator", trip: true, received: false, reason: false },
  PICKUP_CONFIRMED: { state: "PICKED_UP", role: "carrier", trip: true, received: false, reason: false },
  RECEIPT_ACCEPTED: { state: "RECEIVED", role: "buyer", trip: true, received: true, reason: false },
  RECEIPT_ISSUE_REPORTED: { state: "INCIDENT", role: "buyer", trip: true, received: true, reason: true },
};

export const publicEventSchema: z.ZodType<PublicEventPayload> = z.strictObject({
  version: z.literal(1), demo: z.literal(true), network: z.literal("testnet"),
  traceId: eventUuid, eventId: eventUuid, ordinal, type: eventType, role: eventRole, appliedAt,
  detail: z.strictObject({
    state: eventState, scenarioVersion: eventText,
    material: z.strictObject({ id: eventText, label: eventText }),
    quantityKg: eventQuantity, humidityPercent: eventHumidity,
    buyer: z.strictObject({ id: eventText, name: eventText }),
    trip: z.strictObject({ id: eventText, label: eventText }).nullable(),
    receivedKg: eventQuantity.nullable(), reason: z.strictObject({ code: eventText, label: eventText }).nullable(),
  }),
}).superRefine((event, context) => {
  const expected = semantics[event.type];
  if (event.role !== expected.role || event.detail.state !== expected.state
    || (event.detail.trip !== null) !== expected.trip || (event.detail.receivedKg !== null) !== expected.received
    || (event.detail.reason !== null) !== expected.reason) {
    context.addIssue({ code: "custom", message: "INCONSISTENT_EVENT" });
  }
});

export const hcsEnvelopeSchema: z.ZodType<HcsEventEnvelope> = z.strictObject({
  version: z.literal(1), demo: z.literal(true), network: z.literal("testnet"),
  traceId: eventUuid, eventId: eventUuid, ordinal, type: eventType, role: eventRole, digest: eventDigest,
}).refine((envelope) => envelope.role === semantics[envelope.type].role);

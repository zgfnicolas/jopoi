import { createHash } from "node:crypto";
import type { OperationEvent } from "../../generated/prisma/client";
import { canonicalJson } from "../../domain/canonical-json";
import { eventDigest, hcsEnvelopeSchema, publicEventSchema } from "../../domain/event-schemas";
import type { ScenarioSnapshot } from "../../domain/scenario-types";
import type { HcsEventEnvelope, PublicEventPayload, PublicEventRecord, PublicEventType } from "../../shared/event-contracts";
import type { OperationAction, OperationData, SimulatedRole } from "../../shared/operation-contracts";
import { ApplicationError } from "../application-error";
import type { TraceIntegrity } from "../../shared/trace-contracts";

const TYPES: Readonly<Record<OperationAction, PublicEventType | null>> = {
  save: null, publish: "LOT_PUBLISHED", approve: "LOT_APPROVED", reject: "LOT_REJECTED",
  assign: "TRANSPORT_ASSIGNED", pickup: "PICKUP_CONFIRMED", receive: "RECEIPT_ACCEPTED", incident: "RECEIPT_ISSUE_REPORTED",
};

export function eventTypeForAction(action: OperationAction): PublicEventType | null { return TYPES[action]; }

export function hashPublicEvent(value: unknown): PublicEventRecord {
  // Validar JSON antes del schema: no omitir undefined, símbolos o propiedades no JSON.
  canonicalJson(value);
  const parsed = publicEventSchema.safeParse(value);
  if (!parsed.success) throw new ApplicationError("INTERNAL_ERROR");
  const canonical = canonicalJson(parsed.data);
  return { payload: parsed.data, digest: createHash("sha256").update(canonical, "utf8").digest("hex") };
}

export function createPublicEvent(input: {
  traceId: string; eventId: string; ordinal: number; type: PublicEventType;
  role: SimulatedRole; appliedAt: Date; operation: OperationData; snapshot: ScenarioSnapshot;
}): PublicEventRecord {
  const { operation, snapshot } = input;
  const trip = operation.assignedTripId === null ? null : snapshot.trips.find((item) => item.id === operation.assignedTripId);
  if (trip === undefined || (operation.assignedBuyerId !== null && operation.assignedBuyerId !== snapshot.buyer.id)) {
    throw new ApplicationError("INTERNAL_ERROR");
  }
  const reasonCode = operation.rejectionReasonCode ?? operation.incidentReasonCode;
  const reasons = operation.state === "REJECTED" ? snapshot.rejectionReasons : snapshot.incidentReasons;
  const reason = reasonCode === null ? null : reasons.find((item) => item.code === reasonCode);
  if (reason === undefined) throw new ApplicationError("INTERNAL_ERROR");
  // Lista pública explícita. No copiar operation, snapshot, filas SQL o relaciones completas.
  const payload: PublicEventPayload = {
    version: 1, demo: true, network: "testnet", traceId: input.traceId, eventId: input.eventId,
    ordinal: input.ordinal, type: input.type, role: input.role, appliedAt: input.appliedAt.toISOString(),
    detail: {
      state: operation.state, scenarioVersion: snapshot.version,
      material: { id: snapshot.material.id, label: snapshot.material.label },
      quantityKg: operation.quantityKg, humidityPercent: operation.humidityPercent,
      buyer: { id: snapshot.buyer.id, name: snapshot.buyer.name },
      trip: trip === null ? null : { id: trip.id, label: trip.label },
      receivedKg: operation.receivedKg,
      reason: reason === null ? null : { code: reason.code, label: reason.label },
    },
  };
  return hashPublicEvent(payload);
}

/** Solo contraste local; no representa verificación de Hedera o mirror. */
export function readPublicEvent(row: OperationEvent, traceId: string): PublicEventRecord {
  const record = hashPublicEvent(row.payload);
  const event = record.payload;
  if (!eventDigest.safeParse(row.digest).success || record.digest !== row.digest || event.eventId !== row.id
    || event.traceId !== traceId || event.ordinal !== row.ordinal || event.version !== row.payloadVersion
    || event.type !== row.type || event.role.toUpperCase() !== row.simulatedRole || event.appliedAt !== row.appliedAt.toISOString()) {
    throw new ApplicationError("INTERNAL_ERROR");
  }
  return record;
}

export type PublicEventRow = Pick<OperationEvent, "id" | "ordinal" | "type" | "simulatedRole" | "appliedAt" | "payloadVersion" | "payload" | "digest">;

/** Public recovery isolates corruption; private command reads remain strict. */
export function inspectPublicEvent(row: PublicEventRow, traceId: string): { event: PublicEventRecord | null; integrity: TraceIntegrity } {
  const stored = eventDigest.safeParse(row.digest);
  let localDigest: string | null = null;
  try { localDigest = createHash("sha256").update(canonicalJson(row.payload), "utf8").digest("hex"); } catch { /* Invalid JSON remains an explicit mismatch. */ }
  const parsed = publicEventSchema.safeParse(row.payload);
  const payload = parsed.success ? parsed.data : null;
  const matched = payload !== null && stored.success && localDigest === stored.data && payload.eventId === row.id
    && payload.traceId === traceId && payload.ordinal === row.ordinal && payload.version === row.payloadVersion
    && payload.type === row.type && payload.role.toUpperCase() === row.simulatedRole && payload.appliedAt === row.appliedAt.toISOString();
  return {
    event: matched ? { payload: payload!, digest: stored.data! } : null,
    integrity: { state: matched ? "MATCHED" : "MISMATCH", storedDigest: stored.success ? stored.data : null, localDigest },
  };
}

export function createHcsEnvelope(record: PublicEventRecord): { envelope: HcsEventEnvelope; bytes: Uint8Array } {
  const verified = hashPublicEvent(record.payload);
  if (verified.digest !== record.digest) throw new ApplicationError("INTERNAL_ERROR");
  const event = verified.payload;
  const envelope = hcsEnvelopeSchema.parse({
    version: 1, demo: true, network: "testnet", traceId: event.traceId, eventId: event.eventId,
    ordinal: event.ordinal, type: event.type, role: event.role, digest: verified.digest,
  });
  return { envelope, bytes: new TextEncoder().encode(canonicalJson(envelope)) };
}

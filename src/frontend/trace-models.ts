import { z } from "zod";
import { eventDigest, eventHumidity, eventQuantity, eventRole, eventState, eventText, eventType, eventUuid, publicEventSchema } from "@/domain/event-schemas";
import type { PublicTraceResponse, PublicTraceVerificationResponse, TraceEvidence } from "@/shared/trace-contracts";
import { publicationStates, verificationStates } from "./read-models";

const date = z.iso.datetime({ precision: 3 });
const version = z.number().int().positive();
const reference = z.string().min(1).max(128);
const sequence = z.string().regex(/^[1-9]\d*$/).nullable();
const consensus = z.string().regex(/^\d{1,19}\.\d{9}$/).nullable();
export function safeTestnetLink(value: string | null): string | null {
  if (value === null) return null;
  try {
    const url = new URL(value);
    if (url.origin !== "https://testnet.mirrornode.hedera.com" || url.username || url.password || url.hash) return null;
    const transaction = /^\/api\/v1\/transactions\/0\.0\.\d+-\d+-\d+$/.test(url.pathname)
      && url.search === "?nonce=0&scheduled=false";
    const topic = /^\/api\/v1\/topics\/0\.0\.[1-9]\d*$/.test(url.pathname) && url.search === "";
    const message = /^\/api\/v1\/topics\/messages\/\d{1,19}\.\d{9}$/.test(url.pathname) && url.search === "";
    return transaction || topic || message ? url.href : null;
  } catch { return null; }
}
const link = z.string().nullable().transform(safeTestnetLink);
const links = z.object({ transaction: link, topic: link, message: link });
const integrity = z.object({ state: z.enum(["MATCHED", "MISMATCH"]), storedDigest: eventDigest.nullable(), localDigest: eventDigest.nullable() })
  .refine(value => value.state !== "MATCHED" || value.storedDigest !== null && value.storedDigest === value.localDigest);
const evidence: z.ZodType<TraceEvidence> = z.object({ version: z.literal(1), observedAt: date, topicId: reference, transactionId: reference,
  sequenceNumber: sequence, consensusTimestamp: consensus, localDigest: eventDigest, remoteDigest: eventDigest.nullable(), identifiersMatch: z.boolean(), digestMatch: z.boolean() });
const storedVerification = z.object({ state: z.enum(verificationStates), verifiedAt: date.nullable(), evidence: evidence.nullable() })
  .refine(value => value.state !== "MATCHED" || value.evidence !== null && value.evidence.identifiersMatch && value.evidence.digestMatch && value.evidence.localDigest === value.evidence.remoteDigest);
const publication = z.object({ state: z.enum(publicationStates), network: z.literal("testnet"), topicId: reference.nullable(), transactionId: reference.nullable(),
  sequenceNumber: sequence, consensusTimestamp: consensus, confirmedAt: date.nullable(), lastErrorCode: z.string().nullable() });
const company = z.object({ id: eventText, name: eventText, isFictitious: z.literal(true) });
const reason = z.object({ code: eventText, label: eventText });
export const publicTraceSchema: z.ZodType<PublicTraceResponse> = z.object({
  version: z.literal(1), demo: z.literal(true), network: z.literal("testnet"), traceId: eventUuid, expiresAt: date, state: eventState,
  scenario: z.object({ version: eventText, isIllustrative: z.literal(true), disclaimer: eventText,
    material: z.object({ id: eventText, label: eventText, description: eventText }), generator: company, buyer: company,
    route: z.object({ id: eventText, label: eventText, origin: eventText, destination: eventText, distanceKm: z.string().regex(/^\d+\.\d{3}$/) }),
    trip: z.object({ id: eventText, label: eventText, carrier: company }).nullable() }),
  declaration: z.object({ eventId: eventUuid, quantityKg: eventQuantity, humidityPercent: eventHumidity }).nullable(),
  reception: z.object({ eventId: eventUuid, outcome: z.enum(["RECEIVED", "INCIDENT"]), receivedKg: eventQuantity, reason: reason.nullable() }).nullable(),
  events: z.array(z.object({ eventId: eventUuid, ordinal: version, type: eventType, role: eventRole, appliedAt: date, payloadVersion: version,
    event: z.object({ payload: publicEventSchema, digest: eventDigest }).nullable(), integrity, publication, storedVerification, links })),
}).refine(value => value.events.every((event, index) => (index === 0 || event.ordinal > (value.events[index - 1]?.ordinal ?? Infinity))
  && (event.event === null ? event.integrity.state === "MISMATCH" : event.integrity.state === "MATCHED"
    && event.event.digest === event.integrity.storedDigest && event.payloadVersion === 1 && event.event.payload.traceId === value.traceId
    && event.event.payload.eventId === event.eventId && event.event.payload.ordinal === event.ordinal && event.event.payload.type === event.type
    && event.event.payload.role === event.role && event.event.payload.appliedAt === event.appliedAt))
  && new Set(value.events.map(event => event.eventId)).size === value.events.length);
export const publicVerificationSchema: z.ZodType<PublicTraceVerificationResponse> = z.object({ version: z.literal(1), demo: z.literal(true), network: z.literal("testnet"),
  traceId: eventUuid, eventId: eventUuid, expiresAt: date, payloadVersion: version, state: z.enum(verificationStates), integrity, publication, storedVerification,
  observation: z.object({ state: z.enum(["PENDING", "MATCHED", "MISMATCH", "UNAVAILABLE"]), code: z.string().nullable(), evidence }).nullable(), links,
}).refine(value => value.state === (value.integrity.state === "MISMATCH" ? "MISMATCH" : value.observation?.state ?? "NOT_CHECKED"))
  .refine(value => value.state !== "MATCHED" || value.observation?.state === "MATCHED" && value.observation.evidence.identifiersMatch
  && value.observation.evidence.digestMatch && value.observation.evidence.localDigest === value.observation.evidence.remoteDigest);
export const publicTraceExpiry = (value: PublicTraceResponse) => value.expiresAt;

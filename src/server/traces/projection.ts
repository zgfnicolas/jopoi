import "server-only";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { eventDigest } from "../../domain/event-schemas";
import type { TraceEvent, TraceEvidence, TraceLinks, TracePublication, TraceVerification } from "../../shared/trace-contracts";
import type { SimulatedRole } from "../../shared/operation-contracts";
import { ApplicationError } from "../application-error";
import { inspectPublicEvent } from "../events/payload";
import { HCS_CODES } from "../hedera/contracts";
import { mirrorTransactionId } from "../hedera/mirror";

const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1";
const topic = z.string().max(64).regex(/^0\.0\.[1-9]\d*$/);
const transaction = z.string().max(128).refine(value => { try { mirrorTransactionId(value); return true; } catch { return false; } });
const sequence = z.string().regex(/^[1-9]\d{0,18}$/).refine(value => BigInt(value) <= 9223372036854775807n);
const timestamp = z.string().max(30).regex(/^\d{1,19}\.\d{9}$/);
const evidenceSchema: z.ZodType<TraceEvidence> = z.strictObject({
  version: z.literal(1), observedAt: z.iso.datetime({ precision: 3 }), topicId: topic, transactionId: transaction,
  sequenceNumber: sequence.nullable(), consensusTimestamp: timestamp.nullable(), localDigest: eventDigest,
  remoteDigest: eventDigest.nullable(), identifiersMatch: z.boolean(), digestMatch: z.boolean(),
});
export const publicEventSelect = {
  id: true, ordinal: true, type: true, simulatedRole: true, appliedAt: true, payloadVersion: true, payload: true, digest: true,
  publication: { select: {
    state: true, network: true, topicId: true, transactionId: true, sequenceNumber: true, consensusTimestamp: true,
    confirmedAt: true, lastErrorCode: true, verificationState: true, verifiedAt: true, verificationEvidence: true,
    attempts: { select: { transactionId: true, state: true } },
  } },
} as const satisfies Prisma.OperationEventSelect;
export type TraceEventRow = Prisma.OperationEventGetPayload<{ select: typeof publicEventSelect }>;
type PublicationRow = NonNullable<TraceEventRow["publication"]>;

export function traceLinks(publication: TracePublication, observation: TraceEvidence | null = null): TraceLinks {
  const observed = observation?.identifiersMatch === true && observation.transactionId === publication.transactionId && observation.topicId === publication.topicId ? observation : null;
  const consensus = publication.consensusTimestamp ?? observed?.consensusTimestamp ?? null;
  return {
    transaction: publication.transactionId === null ? null : `${MIRROR}/transactions/${mirrorTransactionId(publication.transactionId)}?nonce=0&scheduled=false`,
    topic: publication.topicId === null ? null : `${MIRROR}/topics/${publication.topicId}`,
    message: consensus === null ? null : `${MIRROR}/topics/messages/${consensus}`,
  };
}
function publication(row: PublicationRow): TracePublication {
  if (row.network !== "testnet" || row.topicId !== null && !topic.safeParse(row.topicId).success
    || row.transactionId !== null && !transaction.safeParse(row.transactionId).success
    || row.consensusTimestamp !== null && !timestamp.safeParse(row.consensusTimestamp).success
    || row.sequenceNumber !== null && !sequence.safeParse(row.sequenceNumber.toString()).success) throw new ApplicationError("INTERNAL_ERROR");
  return {
    state: row.state, network: "testnet", topicId: row.topicId, transactionId: row.transactionId,
    sequenceNumber: row.sequenceNumber?.toString() ?? null, consensusTimestamp: row.consensusTimestamp,
    confirmedAt: row.confirmedAt?.toISOString() ?? null, lastErrorCode: HCS_CODES.find(code => code === row.lastErrorCode) ?? null,
  };
}
function storedVerification(row: PublicationRow, storedDigest: string | null): TraceVerification {
  const parsed = evidenceSchema.safeParse(row.verificationEvidence);
  const evidence = parsed.success && parsed.data.transactionId === row.transactionId && parsed.data.topicId === row.topicId
    && parsed.data.localDigest === storedDigest ? parsed.data : null;
  const terminal = row.verificationState === "MATCHED" || row.verificationState === "MISMATCH";
  const validMatch = row.verificationState !== "MATCHED" || evidence !== null && evidence.identifiersMatch && evidence.digestMatch && evidence.remoteDigest === evidence.localDigest;
  return { state: terminal && (evidence === null || !validMatch) ? "UNAVAILABLE" : row.verificationState,
    verifiedAt: row.verifiedAt?.toISOString() ?? null, evidence };
}
export function projectTraceEvent(row: TraceEventRow, traceId: string): TraceEvent {
  if (row.publication === null) throw new ApplicationError("INTERNAL_ERROR");
  const inspected = inspectPublicEvent(row, traceId);
  const summary = publication(row.publication);
  const roles: Record<TraceEventRow["simulatedRole"], SimulatedRole> = { GENERATOR: "generator", COORDINATOR: "coordinator", CARRIER: "carrier", BUYER: "buyer" };
  return {
    eventId: row.id, ordinal: row.ordinal, type: row.type, role: roles[row.simulatedRole], appliedAt: row.appliedAt.toISOString(), payloadVersion: row.payloadVersion,
    event: inspected.event, integrity: inspected.integrity, publication: summary,
    storedVerification: storedVerification(row.publication, inspected.integrity.storedDigest), links: traceLinks(summary),
  };
}
export function hasSubmittedAttempt(row: TraceEventRow): boolean {
  return row.publication?.attempts.some(attempt => attempt.transactionId === row.publication?.transactionId
    && ["STARTED", "UNCERTAIN", "REJECTED", "CONFIRMED"].includes(attempt.state)) ?? false;
}

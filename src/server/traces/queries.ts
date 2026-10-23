import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import type { PublicTraceResponse, PublicTraceVerificationResponse } from "../../shared/trace-contracts";
import { ApplicationError } from "../application-error";
import { withTransaction } from "../database";
import { createHcsEnvelope } from "../events/payload";
import { verifyMessage } from "../hedera/mirror";
import { readRunSnapshot } from "../operations/storage";
import { hasSubmittedAttempt, projectTraceEvent, publicEventSelect, traceLinks } from "./projection";

const runSelect = { id: true, traceId: true, state: true, expiresAt: true, scenarioVersion: true, scenarioSnapshot: true, assignedTripId: true } as const;
type ReadTransaction = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
interface TraceReaderDependencies { transaction: ReadTransaction; verify: typeof verifyMessage; now: () => Date }

/** Only SQL SELECTs and an injected mirror reader. No submission provider or worker dependency. */
export function createTraceReader({ transaction, verify, now }: TraceReaderDependencies) {
  function requireValidity(expiresAt: Date) {
    if (expiresAt.getTime() <= now().getTime()) throw new ApplicationError("TRACE_EXPIRED");
  }
  async function loadRun(tx: Prisma.TransactionClient, traceId: string) {
    const run = await tx.demoRun.findUnique({ where: { traceId }, select: runSelect });
    if (run === null) throw new ApplicationError("NOT_FOUND");
    requireValidity(run.expiresAt);
    return run;
  }
  async function loadEvent(tx: Prisma.TransactionClient, traceId: string, eventId: string) {
    const run = await loadRun(tx, traceId);
    if (run.state === "DRAFT") throw new ApplicationError("NOT_FOUND");
    const row = await tx.operationEvent.findFirst({ where: { id: eventId, runId: run.id }, select: publicEventSelect });
    if (row === null) throw new ApplicationError("NOT_FOUND");
    const event = projectTraceEvent(row, traceId);
    requireValidity(run.expiresAt);
    return { run, row, event };
  }
  return {
    async getTrace(traceId: string): Promise<PublicTraceResponse> {
      return transaction(async tx => {
        const run = await loadRun(tx, traceId);
        const snapshot = readRunSnapshot(run);
        const rows = run.state === "DRAFT" ? [] : await tx.operationEvent.findMany({ where: { runId: run.id }, orderBy: { ordinal: "asc" }, select: publicEventSelect });
        const events = rows.map(row => projectTraceEvent(row, traceId));
        const declaration = events.find(event => event.type === "LOT_PUBLISHED" && event.event !== null);
        const reception = events.find(event => ["RECEIPT_ACCEPTED", "RECEIPT_ISSUE_REPORTED"].includes(event.type) && event.event !== null);
        const trip = run.state === "DRAFT" || run.assignedTripId === null ? null : snapshot.trips.find(item => item.id === run.assignedTripId);
        if (trip === undefined) throw new ApplicationError("INTERNAL_ERROR");
        // Construct nested objects field by field: snapshots also contain prices and requirements.
        const company = (value: { id: string; name: string }) => ({ id: value.id, name: value.name, isFictitious: true as const });
        const response: PublicTraceResponse = {
          version: 1, demo: true, network: "testnet", traceId: run.traceId, expiresAt: run.expiresAt.toISOString(), state: run.state,
          scenario: {
            version: snapshot.version, isIllustrative: true, disclaimer: snapshot.disclaimer,
            material: { id: snapshot.material.id, label: snapshot.material.label, description: snapshot.material.description },
            generator: company(snapshot.generator), buyer: company(snapshot.buyer),
            route: { id: snapshot.route.id, label: snapshot.route.label, origin: snapshot.route.origin, destination: snapshot.route.destination, distanceKm: snapshot.route.distanceKm },
            trip: trip === null ? null : { id: trip.id, label: trip.label, carrier: company(trip.carrier) },
          },
          declaration: declaration?.event === undefined || declaration.event === null ? null : {
            eventId: declaration.eventId, quantityKg: declaration.event.payload.detail.quantityKg, humidityPercent: declaration.event.payload.detail.humidityPercent,
          },
          reception: reception?.event?.payload.detail.receivedKg == null ? null : {
            eventId: reception.eventId, outcome: reception.type === "RECEIPT_ACCEPTED" ? "RECEIVED" : "INCIDENT",
            receivedKg: reception.event.payload.detail.receivedKg,
            reason: reception.event.payload.detail.reason === null ? null : { code: reception.event.payload.detail.reason.code, label: reception.event.payload.detail.reason.label },
          }, events,
        };
        requireValidity(run.expiresAt);
        return response;
      });
    },
    async getVerification(traceId: string, eventId: string): Promise<PublicTraceVerificationResponse> {
      const before = await transaction(tx => loadEvent(tx, traceId, eventId));
      const publication = before.event.publication;
      let observation: PublicTraceVerificationResponse["observation"] = null;
      if (before.event.event !== null && publication.topicId !== null && publication.transactionId !== null && hasSubmittedAttempt(before.row)) {
        requireValidity(before.run.expiresAt);
        const { envelope } = createHcsEnvelope(before.event.event);
        const result = await verify({ transactionId: publication.transactionId, topicId: publication.topicId, envelope,
          sequenceNumber: publication.sequenceNumber, confirmedAt: before.row.publication?.confirmedAt ?? null });
        // Explicit copy: remote evidence may never add fields to the public response.
        const e = result.evidence;
        observation = { state: result.state, code: result.code, evidence: {
          version: 1, observedAt: e.observedAt, topicId: e.topicId, transactionId: e.transactionId,
          sequenceNumber: e.sequenceNumber, consensusTimestamp: e.consensusTimestamp, localDigest: e.localDigest, remoteDigest: e.remoteDigest,
          identifiersMatch: e.identifiersMatch, digestMatch: e.digestMatch,
        } };
      }
      // A concurrent cleanup/expiry or replacement cannot leave a stale successful response.
      return transaction(async tx => {
        const after = await loadEvent(tx, traceId, eventId);
        if (after.event.publication.transactionId !== publication.transactionId || after.event.publication.topicId !== publication.topicId
          || after.event.integrity.storedDigest !== before.event.integrity.storedDigest || after.event.integrity.localDigest !== before.event.integrity.localDigest
          || after.event.payloadVersion !== before.event.payloadVersion) throw new ApplicationError("VERSION_CONFLICT");
        const response: PublicTraceVerificationResponse = {
          version: 1, demo: true, network: "testnet", traceId, eventId, expiresAt: after.run.expiresAt.toISOString(), payloadVersion: after.event.payloadVersion,
          state: after.event.integrity.state === "MISMATCH" ? "MISMATCH" : observation?.state ?? "NOT_CHECKED",
          integrity: after.event.integrity, publication: after.event.publication, storedVerification: after.event.storedVerification,
          observation, links: traceLinks(after.event.publication, observation?.evidence ?? null),
        };
        requireValidity(after.run.expiresAt);
        return response;
      });
    },
  };
}

export function publicTraceReader() {
  return createTraceReader({ transaction: withTransaction, verify: verifyMessage, now: () => new Date() });
}

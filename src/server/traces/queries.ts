import "server-only";
import { performance } from "node:perf_hooks";
import { now as wallNow } from "@/server/runtime/clock";
import { getDeadlinePolicy } from "@/server/runtime/deadlines";
import { verifyMessage } from "@/server/runtime/network";
import type { Prisma } from "../../generated/prisma/client";
import type { PublicTraceResponse, PublicTraceVerificationResponse } from "../../shared/trace-contracts";
import { ApplicationError } from "../application-error";
import { withTransaction } from "../database";
import { mirrorVerificationBudgetMs } from "../deadlines";
import { currentRequestContext, logDiagnostic } from "../diagnostics";
import { createHcsEnvelope } from "../events/payload";
import type { VerificationResult } from "../hedera/contracts";
import { readRunOperation, readRunSnapshot } from "../operations/storage";
import { hasSubmittedAttempt, projectTraceEvent, publicEventSelect, traceLinks } from "./projection";

const runSelect = { id: true, traceId: true, state: true, expiresAt: true, scenarioVersion: true, scenarioSnapshot: true,
  declaredGrams: true, humidityHundredths: true, assignedBuyerId: true, assignedTripId: true, assignedAt: true,
  receivedGrams: true, rejectionReasonCode: true, incidentReasonCode: true } as const;
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
    readRunOperation(run);
    return run;
  }
  async function loadEvent(tx: Prisma.TransactionClient, traceId: string, eventId: string) {
    const run = await loadRun(tx, traceId);
    if (run.state === "DRAFT") throw new ApplicationError("NOT_FOUND");
    const row = await tx.operationEvent.findFirst({ where: { id: eventId, runId: run.id }, select: publicEventSelect });
    if (row === null) throw new ApplicationError("NOT_FOUND");
    const event = projectTraceEvent(row, traceId, readRunSnapshot(run));
    requireValidity(run.expiresAt);
    return { run, row, event };
  }
  return {
    async getTrace(traceId: string): Promise<PublicTraceResponse> {
      return transaction(async tx => {
        const run = await loadRun(tx, traceId);
        const snapshot = readRunSnapshot(run);
        const rows = run.state === "DRAFT" ? [] : await tx.operationEvent.findMany({ where: { runId: run.id }, orderBy: { ordinal: "asc" }, select: publicEventSelect });
        const events = rows.map(row => projectTraceEvent(row, traceId, snapshot));
        const declaration = events.find(event => event.type === "LOT_PUBLISHED" && event.event !== null);
        const reception = events.find(event => ["RECEIPT_ACCEPTED", "RECEIPT_ISSUE_REPORTED"].includes(event.type) && event.event !== null);
        const trip = run.state === "DRAFT" || run.assignedTripId === null ? null : snapshot.trips.find(item => item.id === run.assignedTripId);
        if (trip === undefined) throw new ApplicationError("INTERNAL_ERROR");
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
        const context = currentRequestContext();
        if (context?.clientSignal?.aborted) throw new ApplicationError("DATABASE_UNAVAILABLE");
        const policy = getDeadlinePolicy();
        const remainingMs = context ? context.deadlineAt - performance.now() : policy.verificationDeadlineMs;
        const mirrorBudgetMs = mirrorVerificationBudgetMs(policy, remainingMs);
        const { envelope } = createHcsEnvelope(before.event.event);
        const topicId = publication.topicId;
        const transactionId = publication.transactionId;
        const unavailableResult = (): VerificationResult => ({
          state: "UNAVAILABLE", code: "HCS_MIRROR_UNAVAILABLE",
          evidence: { version: 1, observedAt: now().toISOString(), topicId, transactionId, sequenceNumber: null,
            consensusTimestamp: null, localDigest: envelope.digest, remoteDigest: null, identifiersMatch: false, digestMatch: false },
        });
        const result = await new Promise<VerificationResult>((resolve, reject) => {
          if (mirrorBudgetMs <= 0) {
            logDiagnostic({ event: "publication.recovered", code: "HCS_MIRROR_UNAVAILABLE", outcome: "partial", severity: "WARN", durationMs: 0 });
            resolve(unavailableResult());
            return;
          }
          const controller = new AbortController();
          const onClientAbort = () => {
            clearTimeout(timer);
            controller.abort();
            reject(new ApplicationError("DATABASE_UNAVAILABLE"));
          };
          const timer = setTimeout(() => {
            context?.clientSignal?.removeEventListener("abort", onClientAbort);
            controller.abort();
            logDiagnostic({ event: "publication.recovered", code: "HCS_MIRROR_UNAVAILABLE", outcome: "partial", severity: "WARN", durationMs: mirrorBudgetMs });
            resolve(unavailableResult());
          }, mirrorBudgetMs);
          context?.clientSignal?.addEventListener("abort", onClientAbort, { once: true });
          verify({ transactionId, topicId, envelope, sequenceNumber: publication.sequenceNumber,
            confirmedAt: before.row.publication?.confirmedAt ?? null, signal: controller.signal }).then(
            (value) => { clearTimeout(timer); context?.clientSignal?.removeEventListener("abort", onClientAbort); resolve(value); },
            (error) => { clearTimeout(timer); context?.clientSignal?.removeEventListener("abort", onClientAbort); reject(error); },
          );
        });
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
  return createTraceReader({ transaction: withTransaction, verify: verifyMessage, now: () => wallNow() });
}

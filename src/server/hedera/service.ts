import "server-only";

import type { HcsPublication, Prisma } from "../../generated/prisma/client";
import { canonicalJson } from "../../domain/canonical-json";
import type { PublicationSummary } from "../../shared/event-contracts";
import { ApplicationError } from "../application-error";
import { withTransaction } from "../database";
import { createHcsEnvelope, readPublicEvent } from "../events/payload";
import { jsonObject } from "../operations/storage";
import { HcsError, type HcsCode, type HcsProvider, type NetworkOutcome, type PreparedMessage } from "./contracts";
import { createHcsProvider } from "./provider";
import { publicationSummary } from "./summary";
import { configuredTarget, type HcsTarget } from "./target";

async function load(tx: Prisma.TransactionClient, eventId: string) {
  const row = await tx.hcsPublication.findUnique({
    where: { eventId }, include: { event: { include: { run: true } } },
  });
  if (row === null || row.event.run.expiresAt.getTime() <= Date.now()) throw new ApplicationError("NOT_FOUND");
  const event = readPublicEvent(row.event, row.event.run.traceId);
  const { envelope, bytes } = createHcsEnvelope(event);
  if (bytes.length === 0 || bytes.length > 1024 || row.network !== "testnet") throw new HcsError("HCS_INVALID_EVIDENCE");
  return { row, envelope, bytes };
}

type Loaded = Awaited<ReturnType<typeof load>>;
function boundTarget(item: Loaded): HcsTarget | null {
  const run = item.row.event.run;
  if (run.hcsConfigurationGeneration === null || run.hcsOperatorId === null || run.hcsTopicId === null) return null;
  return { network: "testnet", generation: run.hcsConfigurationGeneration, operatorId: run.hcsOperatorId, topicId: run.hcsTopicId };
}

function prepared(item: Loaded): PreparedMessage | null {
  const { row, envelope } = item;
  if (row.transactionId === null && row.signedTransactionBytes === null) return null;
  const target = boundTarget(item);
  if (target === null || row.transactionId === null || row.signedTransactionBytes === null
    || row.topicId !== target.topicId || row.configurationGeneration !== target.generation) throw new HcsError("HCS_INVALID_PREPARATION");
  return { target, transactionId: row.transactionId, signedBytes: row.signedTransactionBytes, envelope };
}

function sameTarget(left: HcsTarget, right: HcsTarget | null): boolean {
  return right !== null && left.network === right.network && left.topicId === right.topicId
    && left.operatorId === right.operatorId && left.generation === right.generation;
}

const pausedCodes: readonly HcsCode[] = ["HCS_CONFIG_MISSING", "HCS_CONFIG_CHANGED", "HCS_INVALID_KEY", "HCS_INVALID_OPERATOR",
  "HCS_INVALID_TOPIC", "HCS_TOPIC_FEES", "HCS_INSUFFICIENT_TEST_BALANCE"];

function outcomeChanges(row: HcsPublication, outcome: NetworkOutcome): Prisma.HcsPublicationUpdateManyMutationInput {
  if (outcome.kind === "confirmed") return {
    state: "CONFIRMED", confirmedAt: row.confirmedAt ?? new Date(), lastErrorCode: null,
    sequenceNumber: row.sequenceNumber ?? (outcome.sequenceNumber === null ? null : BigInt(outcome.sequenceNumber)),
    consensusTimestamp: row.consensusTimestamp ?? outcome.consensusTimestamp,
    verificationState: row.verificationState === "NOT_CHECKED" ? "PENDING" : row.verificationState,
  };
  // Network unavailability or a later reset never erase a historical confirmation.
  if (row.state === "CONFIRMED") return {};
  return { state: outcome.kind === "unknown" ? "UNCERTAIN" : pausedCodes.includes(outcome.code) ? "PAUSED_CONFIG" : "FAILED",
    lastErrorCode: outcome.code };
}

async function storeOutcome(eventId: string, transactionId: string, outcome: NetworkOutcome): Promise<PublicationSummary> {
  return withTransaction(async (tx) => {
    const { row } = await load(tx, eventId);
    if (row.transactionId !== transactionId) throw new ApplicationError("VERSION_CONFLICT");
    if (outcome.kind === "confirmed" && (outcome.topicId !== null && outcome.topicId !== row.topicId
      || row.sequenceNumber !== null && outcome.sequenceNumber !== null && row.sequenceNumber.toString() !== outcome.sequenceNumber
      || row.consensusTimestamp !== null && outcome.consensusTimestamp !== null && row.consensusTimestamp !== outcome.consensusTimestamp)) {
      throw new HcsError("HCS_INVALID_EVIDENCE");
    }
    const updated = await tx.hcsPublication.update({ where: { eventId }, data: outcomeChanges(row, outcome) });
    return publicationSummary(updated);
  });
}

/** No public routes. S10 owns quotas, leases and scheduling around these methods. */
export function createPublicationService(provider: HcsProvider = createHcsProvider(process.env)) {
  return {
    async prepare(eventId: string): Promise<PublicationSummary> {
      try {
        const item = await withTransaction(async (tx) => {
          let item = await load(tx, eventId);
          if (prepared(item) !== null) return item;
          const current = configuredTarget(process.env);
          const bound = boundTarget(item);
          if (current === null) throw new HcsError("HCS_CONFIG_MISSING");
          if (bound !== null && !sameTarget(bound, current)) throw new HcsError("HCS_CONFIG_CHANGED");
          if (bound === null) {
            const run = await tx.demoRun.update({ where: { id: item.row.event.runId }, data: {
              hcsConfigurationGeneration: current.generation, hcsTopicId: current.topicId, hcsOperatorId: current.operatorId,
            } });
            item = { ...item, row: { ...item.row, event: { ...item.row.event, run } } };
          }
          return item;
        });
        if (prepared(item) !== null) return publicationSummary(item.row);
        const target = boundTarget(item);
        if (target === null) throw new HcsError("HCS_CONFIG_MISSING");
        // Network queries/signing happen after the binding transaction has committed.
        const signed = await provider.prepare(target, item.envelope, item.bytes);
        if (!sameTarget(signed.target, target) || canonicalJson(signed.envelope) !== canonicalJson(item.envelope)) throw new HcsError("HCS_INVALID_PREPARATION");
        try {
          return await withTransaction(async (tx) => {
            const fresh = await load(tx, eventId);
            if (prepared(fresh) !== null) return publicationSummary(fresh.row);
            if (!sameTarget(target, boundTarget(fresh))) throw new HcsError("HCS_CONFIG_CHANGED");
            const changed = await tx.hcsPublication.updateMany({ where: { eventId, transactionId: null }, data: {
              topicId: target.topicId, configurationGeneration: target.generation, transactionId: signed.transactionId,
              signedTransactionBytes: Uint8Array.from(signed.signedBytes), lastErrorCode: null,
              state: fresh.row.state === "PAUSED_CONFIG" ? "QUEUED" : fresh.row.state,
            } });
            if (changed.count !== 1) throw new ApplicationError("VERSION_CONFLICT");
            return publicationSummary(await tx.hcsPublication.findUniqueOrThrow({ where: { eventId } }));
          });
        } catch (error) {
          // Losing a preparation race discards the local candidate. Read only; never re-sign/re-send.
          if (!(error instanceof ApplicationError && error.code === "VERSION_CONFLICT")) throw error;
          return withTransaction(async (tx) => {
            const fresh = await load(tx, eventId);
            if (prepared(fresh) === null) throw error;
            return publicationSummary(fresh.row);
          });
        }
      } catch (error) {
        if (!(error instanceof HcsError)) throw error;
        return withTransaction(async (tx) => {
          const { row } = await load(tx, eventId);
          // A concurrent successful preparation takes precedence over a failed candidate.
          if (row.transactionId !== null || row.state === "CONFIRMED") return publicationSummary(row);
          const updated = await tx.hcsPublication.update({ where: { eventId }, data: {
            state: pausedCodes.includes(error.code) ? "PAUSED_CONFIG" : error.code === "HCS_UNAVAILABLE" ? "QUEUED" : "FAILED",
            lastErrorCode: error.code,
          } });
          return publicationSummary(updated);
        });
      }
    },

    async submit(eventId: string, leaseOwner: string): Promise<PublicationSummary> {
      const item = await withTransaction(async (tx) => {
        const item = await load(tx, eventId);
        const { row } = item;
        if (row.state !== "IN_FLIGHT" || row.leaseOwner !== leaseOwner || row.leaseExpiresAt === null
          || row.leaseExpiresAt.getTime() <= Date.now() || row.automaticAttempts + row.manualAttempts < 1) {
          throw new ApplicationError("STATE_CONFLICT");
        }
        return item;
      });
      const signed = prepared(item);
      if (signed === null) throw new HcsError("HCS_INVALID_PREPARATION");
      // A durable boundary marker means a previous process MAY have sent this exact ID.
      // That case only reconciles, including when a crash happened just before the network call.
      const history = item.row.attemptHistory;
      if (!Array.isArray(history)) throw new HcsError("HCS_INVALID_PREPARATION");
      if (history.some((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry)
        && entry.boundary === "SUBMISSION_STARTED" && entry.transactionId === signed.transactionId)) {
        return storeOutcome(eventId, signed.transactionId, await provider.reconcile(signed.transactionId, signed.target.topicId));
      }
      if (!sameTarget(signed.target, configuredTarget(process.env))) {
        return storeOutcome(eventId, signed.transactionId, { kind: "rejected", code: "HCS_CONFIG_CHANGED" });
      }
      await withTransaction(async (tx) => {
        const fresh = await load(tx, eventId);
        if (fresh.row.transactionId !== signed.transactionId || fresh.row.updatedAt.getTime() !== item.row.updatedAt.getTime()
          || fresh.row.state !== "IN_FLIGHT" || fresh.row.leaseOwner !== leaseOwner
          || fresh.row.leaseExpiresAt === null || fresh.row.leaseExpiresAt.getTime() <= Date.now()) throw new ApplicationError("VERSION_CONFLICT");
        await tx.hcsPublication.update({ where: { eventId }, data: {
          attemptHistory: [...history, { boundary: "SUBMISSION_STARTED", transactionId: signed.transactionId, at: new Date().toISOString() }],
        } });
      });
      // Only committed bytes and a committed boundary marker can reach this external call.
      const result = await provider.submit(signed);
      return storeOutcome(eventId, signed.transactionId, result.kind === "accepted"
        ? { kind: "unknown", code: "HCS_RESULT_UNKNOWN" } : result);
    },

    async reconcile(eventId: string): Promise<PublicationSummary> {
      const item = await withTransaction((tx) => load(tx, eventId));
      const signed = prepared(item);
      if (signed === null) return publicationSummary(item.row);
      return storeOutcome(eventId, signed.transactionId, await provider.reconcile(signed.transactionId, signed.target.topicId));
    },

    async verify(eventId: string): Promise<PublicationSummary> {
      const item = await withTransaction((tx) => load(tx, eventId));
      const signed = prepared(item);
      if (signed === null || item.row.state !== "CONFIRMED") return publicationSummary(item.row);
      const result = await provider.verify(signed, item.row.sequenceNumber?.toString() ?? null, item.row.confirmedAt);
      return withTransaction(async (tx) => {
        const fresh = await load(tx, eventId);
        if (fresh.row.transactionId !== signed.transactionId || fresh.row.updatedAt.getTime() !== item.row.updatedAt.getTime()) {
          throw new ApplicationError("VERSION_CONFLICT");
        }
        const observed = result.state === "MATCHED" || result.state === "MISMATCH";
        const updated = await tx.hcsPublication.update({ where: { eventId }, data: {
          verificationState: result.state, verifiedAt: new Date(result.evidence.observedAt), lastErrorCode: result.code,
          ...(observed || fresh.row.verificationEvidence === null ? { verificationEvidence: jsonObject(result.evidence) } : {}),
          ...(result.state === "MATCHED" ? {
            sequenceNumber: result.evidence.sequenceNumber === null ? fresh.row.sequenceNumber : BigInt(result.evidence.sequenceNumber),
            consensusTimestamp: result.evidence.consensusTimestamp,
          } : {}),
        } });
        return publicationSummary(updated);
      });
    },
  };
}

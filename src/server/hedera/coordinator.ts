import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client";
import { canonicalJson } from "../../domain/canonical-json";
import { ApplicationError } from "../application-error";
import { createConfigReader, type Environment } from "../config/environment";
import { createHcsEnvelope, readPublicEvent } from "../events/payload-core";
import { HcsError, type HcsProvider, type NetworkOutcome, type PreparedMessage } from "./contracts";
import { configuredTarget, type HcsTarget } from "./target";

export type TransactionRunner = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
export interface CoordinationContext {
  transaction: TransactionRunner;
  provider: HcsProvider;
  environment: Environment;
  now: () => Date;
}
export const utcDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
export const nextUtcDay = (now: Date) => new Date(utcDay(now).getTime() + 86400000);
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(canonicalJson(value));
const include = { event: { include: { run: true } }, attempts: { orderBy: { slot: "desc" as const }, take: 1 } };
const paused = new Set(["HCS_CONFIG_MISSING", "HCS_CONFIG_CHANGED", "HCS_INVALID_KEY", "HCS_INVALID_OPERATOR", "HCS_INVALID_TOPIC", "HCS_TOPIC_FEES", "HCS_INSUFFICIENT_TEST_BALANCE"]);
class BudgetEnded extends Error {}
function requireBudget(deadline: number, now: Date, required = 20000) {
  if (deadline - now.getTime() < required) throw new BudgetEnded();
}

export async function quotaSummary(tx: Prisma.TransactionClient, environment: Environment, now: Date) {
  const config = createConfigReader(environment).hcsQuota();
  const used = (await tx.dailyQuota.findUnique({ where: { scope_date: { scope: "HCS_GLOBAL", date: utcDay(now) } } }))?.used ?? 0;
  const limit = config.status === "configured" ? config.config.limit : null;
  return { limit, used, remaining: limit === null ? null : Math.max(0, limit - used), resetsAt: nextUtcDay(now).toISOString() };
}

/** Serializable admission; a crash can waste quota, never refund an uncertain send. */
async function reserve(tx: Prisma.TransactionClient, environment: Environment, now: Date): Promise<boolean> {
  const config = createConfigReader(environment).hcsQuota();
  if (config.status !== "configured") throw new HcsError("HCS_CONFIG_MISSING");
  const key = { scope: "HCS_GLOBAL", date: utcDay(now) };
  await tx.dailyQuota.upsert({ where: { scope_date: key }, create: { ...key, used: 0 }, update: {} });
  return (await tx.dailyQuota.updateMany({ where: { ...key, used: { lt: config.config.limit } }, data: { used: { increment: 1 } } })).count === 1;
}

function sameTarget(a: HcsTarget, b: HcsTarget | null) {
  return b !== null && a.generation === b.generation && a.topicId === b.topicId && a.operatorId === b.operatorId;
}

/** Every mutation is fenced by an unexpired owner; external calls never hold a SQL transaction. */
export function createCoordinator(context: CoordinationContext) {
  const { transaction, provider, environment, now } = context;
  async function load(tx: Prisma.TransactionClient, eventId: string, owner: string) {
    const row = await tx.hcsPublication.findUnique({ where: { eventId }, include });
    if (row === null || row.event.run.expiresAt <= now()) throw new ApplicationError("NOT_FOUND");
    if (row.leaseOwner !== owner || row.leaseExpiresAt === null || row.leaseExpiresAt <= now()) throw new ApplicationError("VERSION_CONFLICT");
    return row;
  }
  type Loaded = Awaited<ReturnType<typeof load>>;
  function envelope(row: Loaded) { return createHcsEnvelope(readPublicEvent(row.event, row.event.run.traceId)); }
  function target(row: Loaded): HcsTarget | null {
    const r = row.event.run;
    return r.hcsConfigurationGeneration === null || r.hcsTopicId === null || r.hcsOperatorId === null ? null
      : { network: "testnet", generation: r.hcsConfigurationGeneration, topicId: r.hcsTopicId, operatorId: r.hcsOperatorId };
  }
  function prepared(row: Loaded): PreparedMessage {
    const bound = target(row);
    if (!bound || !row.transactionId || !row.signedTransactionBytes || row.topicId !== bound.topicId || row.configurationGeneration !== bound.generation) throw new HcsError("HCS_INVALID_PREPARATION");
    return { target: bound, transactionId: row.transactionId, signedBytes: row.signedTransactionBytes, envelope: envelope(row).envelope };
  }
  async function predecessor(tx: Prisma.TransactionClient, row: Loaded) {
    return tx.operationEvent.findFirst({ where: { runId: row.event.runId, ordinal: { lt: row.event.ordinal }, publication: { is: { state: { not: "CONFIRMED" } } } }, select: { id: true } });
  }
  async function claim(eventId: string): Promise<string | null> {
    return transaction(async (tx) => {
      const row = await tx.hcsPublication.findUnique({ where: { eventId }, include });
      const at = now();
      if (!row || row.event.run.expiresAt <= at || row.leaseExpiresAt !== null && row.leaseExpiresAt > at
        || row.nextAttemptAt !== null && row.nextAttemptAt > at) return null;
      if (row.state === "CONFIRMED" && ["MATCHED", "MISMATCH"].includes(row.verificationState)) return null;
      if (await predecessor(tx, row)) return null;
      const owner = randomUUID();
      const changed = await tx.hcsPublication.updateMany({ where: { eventId, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: at } }] }, data: { leaseOwner: owner, leaseExpiresAt: new Date(at.getTime() + 90000) } });
      return changed.count === 1 ? owner : null;
    });
  }
  async function outcome(eventId: string, owner: string, transactionId: string, result: NetworkOutcome) {
    await transaction(async (tx) => {
      const row = await load(tx, eventId, owner);
      if (row.transactionId !== transactionId) throw new ApplicationError("VERSION_CONFLICT");
      const attempt = row.attempts[0];
      if (!attempt || attempt.transactionId !== transactionId) throw new HcsError("HCS_INVALID_PREPARATION");
      if (result.kind === "confirmed") {
        if (result.topicId !== null && result.topicId !== row.topicId
          || row.sequenceNumber !== null && result.sequenceNumber !== null && row.sequenceNumber.toString() !== result.sequenceNumber
          || row.consensusTimestamp !== null && result.consensusTimestamp !== null && row.consensusTimestamp !== result.consensusTimestamp) throw new HcsError("HCS_INVALID_EVIDENCE");
        await tx.hcsSubmissionAttempt.update({ where: { id: attempt.id }, data: { state: "CONFIRMED", finishedAt: now(), lastErrorCode: null } });
        await tx.hcsPublication.update({ where: { eventId }, data: {
          state: "CONFIRMED", confirmedAt: row.confirmedAt ?? now(), lastErrorCode: null, nextAttemptAt: now(),
          sequenceNumber: row.sequenceNumber ?? (result.sequenceNumber === null ? null : BigInt(result.sequenceNumber)),
          consensusTimestamp: row.consensusTimestamp ?? result.consensusTimestamp,
          verificationState: row.verificationState === "NOT_CHECKED" ? "PENDING" : row.verificationState,
        } });
        return;
      }
      if (row.state === "CONFIRMED" || attempt.state === "REJECTED") return;
      const rejected = result.kind === "rejected";
      const absent = result.kind === "not_sent";
      await tx.hcsSubmissionAttempt.update({ where: { id: attempt.id }, data: {
        state: rejected ? "REJECTED" : absent ? "RESERVED" : "UNCERTAIN",
        proof: rejected ? result.source : absent ? "NOT_SENT" : "NONE",
        finishedAt: rejected || absent ? now() : null, lastErrorCode: result.code,
      } });
      const exhausted = rejected && (row.manualAttempts > 0 || row.automaticAttempts >= 3 && row.manualAuthorizedAt === null);
      await tx.hcsPublication.update({ where: { eventId }, data: {
        state: exhausted ? "FAILED" : paused.has(result.code) && (absent || rejected) ? "PAUSED_CONFIG" : rejected ? "FAILED" : absent ? "QUEUED" : "UNCERTAIN",
        lastErrorCode: result.code,
        nextAttemptAt: exhausted ? null : new Date(now().getTime() + (absent || rejected && paused.has(result.code) ? 900000 : rejected && row.automaticAttempts >= 2 ? 300000 : 60000)),
      } });
    });
  }
  async function prepare(eventId: string, owner: string, deadline: number) {
    const item = await transaction(async (tx) => {
      let row = await load(tx, eventId, owner);
      const current = configuredTarget(environment);
      const bound = target(row);
      if (!current) throw new HcsError("HCS_CONFIG_MISSING");
      if (bound && !sameTarget(bound, current)) throw new HcsError("HCS_CONFIG_CHANGED");
      if (!bound) {
        const run = await tx.demoRun.update({ where: { id: row.event.runId }, data: { hcsConfigurationGeneration: current.generation, hcsTopicId: current.topicId, hcsOperatorId: current.operatorId } });
        row = { ...row, event: { ...row.event, run } };
      }
      return row;
    });
    const bound = target(item)!;
    const message = envelope(item);
    requireBudget(deadline, now());
    const signed = await provider.prepare(bound, message.envelope, message.bytes);
    if (!sameTarget(bound, signed.target) || canonicalJson(message.envelope) !== canonicalJson(signed.envelope)) throw new HcsError("HCS_INVALID_PREPARATION");
    await transaction(async (tx) => {
      const row = await load(tx, eventId, owner);
      if (row.transactionId !== item.transactionId) throw new ApplicationError("VERSION_CONFLICT");
      const latest = row.attempts[0];
      if (latest && !["RESERVED", "REJECTED"].includes(latest.state)) throw new ApplicationError("STATE_CONFLICT");
      const previous = latest?.transactionId === row.transactionId ? latest : undefined;
      // Preserve every superseded preparation, including locally proven unsent bytes.
      const history = Array.isArray(row.attemptHistory) ? row.attemptHistory : [];
      await tx.hcsPublication.update({ where: { eventId }, data: {
        topicId: bound.topicId, configurationGeneration: bound.generation, transactionId: signed.transactionId,
        signedTransactionBytes: Uint8Array.from(signed.signedBytes),
        attemptHistory: json([...history, ...(row.transactionId ? [{ boundary: "SUPERSEDED", transactionId: row.transactionId,
          signedBytesBase64: Buffer.from(row.signedTransactionBytes!).toString("base64"), at: now().toISOString(),
          proof: previous?.proof ?? "NOT_SENT", lastErrorCode: previous?.lastErrorCode ?? null,
          quotaDate: previous?.quotaDate.toISOString() ?? null, finishedAt: previous?.finishedAt?.toISOString() ?? null,
          topicId: row.topicId, operatorId: bound.operatorId, configurationGeneration: row.configurationGeneration }] : [])]),
      } });
    });
  }
  async function send(eventId: string, owner: string, deadline: number) {
    requireBudget(deadline, now());
    const admissionDay = utcDay(now());
    const signed = await transaction(async (tx) => {
      const row = await load(tx, eventId, owner);
      if (await predecessor(tx, row)) return null;
      const signed = prepared(row);
      if (!sameTarget(signed.target, configuredTarget(environment))) throw new HcsError("HCS_CONFIG_CHANGED");
      let attempt = row.attempts[0];
      if (attempt && !["RESERVED", "REJECTED"].includes(attempt.state)) throw new ApplicationError("STATE_CONFLICT");
      const reuse = attempt?.state === "RESERVED";
      const manual = !reuse && row.automaticAttempts >= 3;
      if (!reuse && (manual && (row.manualAuthorizedAt === null || row.manualAttempts >= 1))) return null;
      const day = utcDay(now());
      if (!reuse || attempt!.quotaDate.getTime() !== day.getTime()) {
        if (!await reserve(tx, environment, now())) {
          await tx.hcsPublication.update({ where: { eventId }, data: { state: "PAUSED_QUOTA", lastErrorCode: "HCS_QUOTA_EXHAUSTED", nextAttemptAt: nextUtcDay(now()) } });
          return null;
        }
      }
      const data = { transactionId: signed.transactionId, signedTransactionBytes: Uint8Array.from(signed.signedBytes), topicId: signed.target.topicId,
        operatorId: signed.target.operatorId, configurationGeneration: signed.target.generation, quotaDate: day,
        state: "STARTED" as const, startedAt: now(), finishedAt: null, proof: "NONE", lastErrorCode: null };
      if (reuse) attempt = await tx.hcsSubmissionAttempt.update({ where: { id: attempt!.id }, data });
      else attempt = await tx.hcsSubmissionAttempt.create({ data: { ...data, eventId, slot: manual ? 4 : row.automaticAttempts + 1, kind: manual ? "MANUAL" : "AUTOMATIC" } });
      const history = Array.isArray(row.attemptHistory) ? row.attemptHistory : [];
      await tx.hcsPublication.update({ where: { eventId }, data: {
        state: "IN_FLIGHT", nextAttemptAt: new Date(now().getTime() + 60000),
        ...(!reuse ? manual ? { manualAttempts: { increment: 1 } } : { automaticAttempts: { increment: 1 } } : {}),
        attemptHistory: json([...history, { boundary: "SUBMISSION_STARTED", transactionId: signed.transactionId, attemptId: attempt.id, at: now().toISOString() }]),
      } });
      return signed;
    });
    if (!signed) return;
    if (deadline - now().getTime() < 8000 || utcDay(now()).getTime() !== admissionDay.getTime()) {
      await outcome(eventId, owner, signed.transactionId, { kind: "not_sent", code: "HCS_UNAVAILABLE" });
      return;
    }
    const result = await provider.submit(signed);
    await outcome(eventId, owner, signed.transactionId, result.kind === "accepted" ? { kind: "unknown", code: "HCS_RESULT_UNKNOWN" } : result);
  }
  async function verify(eventId: string, owner: string, deadline: number) {
    const row = await transaction((tx) => load(tx, eventId, owner));
    if (row.state !== "CONFIRMED" || ["MATCHED", "MISMATCH"].includes(row.verificationState)) return;
    const signed = prepared(row);
    requireBudget(deadline, now());
    const result = await provider.verify(signed, row.sequenceNumber?.toString() ?? null, row.confirmedAt);
    await transaction(async (tx) => {
      const fresh = await load(tx, eventId, owner);
      if (fresh.transactionId !== signed.transactionId) throw new ApplicationError("VERSION_CONFLICT");
      const terminal = result.state === "MATCHED" || result.state === "MISMATCH";
      await tx.hcsPublication.update({ where: { eventId }, data: {
        verificationState: result.state, verifiedAt: new Date(result.evidence.observedAt), lastErrorCode: result.code,
        nextAttemptAt: terminal ? null : new Date(now().getTime() + 900000),
        ...(terminal || fresh.verificationEvidence === null ? { verificationEvidence: json(result.evidence) } : {}),
        ...(result.state === "MATCHED" ? { sequenceNumber: result.evidence.sequenceNumber === null ? fresh.sequenceNumber : BigInt(result.evidence.sequenceNumber), consensusTimestamp: result.evidence.consensusTimestamp } : {}),
      } });
    });
  }
  async function processEvent(eventId: string, deadline: number): Promise<boolean> {
    if (deadline - now().getTime() < 20000) return false;
    const owner = await claim(eventId);
    if (!owner) return false;
    try {
      let row = await transaction((tx) => load(tx, eventId, owner));
      if (row.state === "CONFIRMED") { await verify(eventId, owner, deadline); return true; }
      const attempt = row.attempts[0];
      if (attempt && (["STARTED", "UNCERTAIN"].includes(attempt.state)
        || attempt.state === "REJECTED" && row.transactionId === attempt.transactionId)) {
        requireBudget(deadline, now());
        const result = await provider.reconcile(attempt.transactionId, attempt.topicId);
        await outcome(eventId, owner, attempt.transactionId, result);
        row = await transaction((tx) => load(tx, eventId, owner));
        if (row.state === "CONFIRMED") { if (deadline - now().getTime() >= 20000) await verify(eventId, owner, deadline); return true; }
        if (row.attempts[0]?.state !== "REJECTED") return true;
        if (row.nextAttemptAt === null || row.nextAttemptAt > now()) return true;
      }
      if (row.attempts[0]?.state !== "RESERVED" && row.automaticAttempts >= 3 && (row.manualAuthorizedAt === null || row.manualAttempts >= 1)) return true;
      if (deadline - now().getTime() < 20000) return true;
      // Unsent/reserved bytes may expire safely; sent bytes are reconciled above.
      await prepare(eventId, owner, deadline);
      if (deadline - now().getTime() < 20000) return true;
      await send(eventId, owner, deadline);
      row = await transaction((tx) => load(tx, eventId, owner));
      if (row.state === "UNCERTAIN" && row.transactionId && deadline - now().getTime() >= 20000) {
        await outcome(eventId, owner, row.transactionId, await provider.reconcile(row.transactionId, row.topicId!));
        row = await transaction((tx) => load(tx, eventId, owner));
        if (row.state === "CONFIRMED" && deadline - now().getTime() >= 20000) await verify(eventId, owner, deadline);
      }
      return true;
    } catch (error) {
      if (error instanceof BudgetEnded) return true;
      if (error instanceof HcsError) await transaction(async (tx) => {
        const row = await load(tx, eventId, owner);
        const uncertain = row.attempts[0] && ["STARTED", "UNCERTAIN"].includes(row.attempts[0].state);
        await tx.hcsPublication.update({ where: { eventId }, data: {
          state: row.state === "CONFIRMED" ? "CONFIRMED" : uncertain ? "UNCERTAIN" : paused.has(error.code) ? "PAUSED_CONFIG" : "QUEUED",
          ...(row.state === "CONFIRMED" ? { verificationState: "UNAVAILABLE" } : {}),
          lastErrorCode: error.code, nextAttemptAt: new Date(now().getTime() + 900000),
        } });
      });
      else throw error;
      return true;
    } finally {
      await transaction(async (tx) => { await tx.hcsPublication.updateMany({ where: { eventId, leaseOwner: owner }, data: { leaseOwner: null, leaseExpiresAt: null } }); });
    }
  }
  async function drain(options: { traceId?: string; maxEvents: number; deadline: number }) {
    const visited: string[] = [];
    let processed = 0;
    // Reserve two SQL windows for releasing ownership and reporting remaining work.
    const workDeadline = options.deadline - 14000;
    while (visited.length < options.maxEvents && workDeadline - now().getTime() >= 20000) {
      const candidates = await eligible(options.traceId, visited, 1);
      if (!candidates.length) break;
      let claimed = false;
      for (const candidate of candidates) {
        if (visited.length >= options.maxEvents || workDeadline - now().getTime() < 20000) break;
        visited.push(candidate.eventId);
        if (await processEvent(candidate.eventId, workDeadline)) { processed++; claimed = true; break; }
      }
      if (!claimed) break;
    }
    return { processed, hasMore: (await eligible(options.traceId, [], 1)).length > 0 };
  }
  // Filter predecessors in SQL so permanently blocked runs cannot starve other runs.
  async function eligible(traceId: string | undefined, visited: string[], limit: number) {
    return transaction(tx => tx.$queryRaw<{ eventId: string }[]>(Prisma.sql`
      SELECT p."eventId" FROM "HcsPublication" p
      JOIN "OperationEvent" e ON e.id=p."eventId" JOIN "DemoRun" r ON r.id=e."runId"
      WHERE r."expiresAt" > ${now()} AND ${traceId ? Prisma.sql`r."traceId"=${traceId}::uuid` : Prisma.sql`TRUE`}
        AND ${visited.length ? Prisma.sql`p."eventId" NOT IN (${Prisma.join(visited.map(id => Prisma.sql`${id}::uuid`))})` : Prisma.sql`TRUE`}
        AND (p."nextAttemptAt" IS NULL OR p."nextAttemptAt" <= ${now()})
        AND (p."leaseExpiresAt" IS NULL OR p."leaseExpiresAt" <= ${now()})
        AND (p.state <> 'CONFIRMED' OR p."verificationState" IN ('NOT_CHECKED','PENDING','UNAVAILABLE'))
        AND (p."automaticAttempts" < 3 OR p.state IN ('CONFIRMED','UNCERTAIN','IN_FLIGHT')
          OR (p."manualAuthorizedAt" IS NOT NULL AND p."manualAttempts"=0)
          OR EXISTS (SELECT 1 FROM "HcsSubmissionAttempt" a WHERE a."eventId"=p."eventId" AND a.state='RESERVED'))
        AND NOT EXISTS (SELECT 1 FROM "OperationEvent" previous JOIN "HcsPublication" pp ON pp."eventId"=previous.id
          WHERE previous."runId"=e."runId" AND previous.ordinal < e.ordinal AND pp.state <> 'CONFIRMED')
      ORDER BY p."createdAt", e.ordinal, p."eventId" LIMIT ${limit}`));
  }
  return { drain };
}

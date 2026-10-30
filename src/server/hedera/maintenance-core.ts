import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Prisma } from "../../generated/prisma/client";
import { ApplicationError } from "../application-error";
import { createCoordinator, utcDay, type CoordinationContext } from "./coordinator";

const NAME = "DAILY_MAINTENANCE";
/** Shared by authenticated cron and explicit admin CLI. Each category is bounded. */
export async function runMaintenance(context: CoordinationContext, force = false) {
  const { transaction, now } = context;
  const monotonicStarted = performance.now();
  const durationMs = () => Math.round(performance.now() - monotonicStarted);
  const started = now().getTime(), deadline = started + 45000, owner = randomUUID();
  const claimed = await transaction(async (tx) => {
    await tx.maintenanceLease.upsert({ where: { name: NAME }, create: { name: NAME }, update: {} });
    return (await tx.maintenanceLease.updateMany({ where: { name: NAME,
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { lte: now() } }] },
        ...(force ? [] : [{ OR: [{ lastCompletedDate: null }, { lastCompletedDate: { lt: utcDay(now()) } }] }])],
    }, data: { owner, expiresAt: new Date(started + 120000) } })).count === 1;
  });
  if (!claimed) return { skipped: true, executionId: owner, durationMs: durationMs() };
  const counts = { runs: 0, contacts: 0, sessions: 0, quotas: 0, leases: 0, rateBuckets: 0 };
  let released = false;
  // Leave maxWait + transaction timeout before starting another cleanup transaction.
  const canClean = () => now().getTime() + 7000 <= started + 15000;
  async function fenced(tx: Prisma.TransactionClient) {
    const lease = await tx.maintenanceLease.findUnique({ where: { name: NAME } });
    if (!lease || lease.owner !== owner || !lease.expiresAt || lease.expiresAt <= now()) throw new ApplicationError("STATE_CONFLICT");
  }
  try {
    const expiredRuns: Prisma.DemoRunWhereInput = { expiresAt: { lte: now() }, events: { none: { publication: { is: { leaseExpiresAt: { gt: now() } } } } } };
    const expiredContacts = { expiresAt: { lte: now() } };
    const expiredSessions = { expiresAt: { lte: now() }, runs: { none: {} } };
    const oldQuotas = { date: { lt: new Date(utcDay(now()).getTime() - 8 * 86400000) } };
    const oldLeases = { leaseExpiresAt: { lte: now() } };
    if (canClean()) counts.rateBuckets = await transaction(async tx => {
      await fenced(tx);
      return tx.$executeRaw`DELETE FROM "RequestRateBucket" WHERE ("scope","subject","windowStart") IN
        (SELECT "scope","subject","windowStart" FROM "RequestRateBucket" WHERE "expiresAt" <= ${now().toISOString()}::timestamptz ORDER BY "expiresAt" LIMIT 1000)`;
    });
    if (canClean()) counts.runs = await transaction(async (tx) => {
      await fenced(tx);
      const rows = await tx.demoRun.findMany({ where: expiredRuns, take: 100, select: { id: true } });
      return (await tx.demoRun.deleteMany({ where: { ...expiredRuns, id: { in: rows.map(r => r.id) } } })).count;
    });
    if (canClean()) counts.contacts = await transaction(async (tx) => {
      await fenced(tx);
      const rows = await tx.demoRequest.findMany({ where: expiredContacts, take: 100, select: { id: true } });
      return (await tx.demoRequest.deleteMany({ where: { id: { in: rows.map(r => r.id) } } })).count;
    });
    if (canClean()) counts.sessions = await transaction(async (tx) => {
      await fenced(tx);
      const rows = await tx.demoSession.findMany({ where: expiredSessions, take: 100, select: { id: true } });
      return (await tx.demoSession.deleteMany({ where: { ...expiredSessions, id: { in: rows.map(r => r.id) } } })).count;
    });
    if (canClean()) counts.quotas = await transaction(async (tx) => {
      await fenced(tx);
      const rows = await tx.dailyQuota.findMany({ where: oldQuotas, take: 100, select: { scope: true, date: true } });
      return rows.length ? (await tx.dailyQuota.deleteMany({ where: { OR: rows } })).count : 0;
    });
    if (canClean()) counts.leases = await transaction(async (tx) => {
      await fenced(tx);
      const rows = await tx.hcsPublication.findMany({ where: oldLeases, take: 100, select: { eventId: true } });
      return (await tx.hcsPublication.updateMany({ where: { ...oldLeases, eventId: { in: rows.map(r => r.eventId) } }, data: { leaseOwner: null, leaseExpiresAt: null } })).count;
    });
    const cleanupComplete = canClean() && await transaction(async (tx) => {
      await fenced(tx);
      return !await tx.demoRun.findFirst({ where: { expiresAt: { lte: now() } }, select: { id: true } })
        && !await tx.demoRequest.findFirst({ where: expiredContacts, select: { id: true } })
        && !await tx.demoSession.findFirst({ where: expiredSessions, select: { id: true } })
        && !await tx.dailyQuota.findFirst({ where: oldQuotas, select: { scope: true } })
        && !await tx.hcsPublication.findFirst({ where: oldLeases, select: { eventId: true } })
        && !await tx.requestRateBucket.findFirst({ where: { expiresAt: { lte: now() } }, select: { scope: true } });
    });
    let publications = { processed: 0, hasMore: true };
    let publicationError: string | null = null;
    try { publications = await createCoordinator(context).drain({ maxEvents: 10, deadline: deadline - 7000 }); }
    catch { publicationError = "PUBLICATION_WORK_PENDING"; }
    const complete = cleanupComplete && !publications.hasMore && publicationError === null;
    await transaction(async (tx) => {
      await fenced(tx);
      await tx.maintenanceLease.update({ where: { name: NAME }, data: { ...(complete ? { lastCompletedDate: utcDay(now()) } : {}), owner: null, expiresAt: null } });
    });
    released = true;
    return { skipped: false, executionId: owner, durationMs: durationMs(), counts, cleanupComplete, publications, publicationError, complete };
  } finally {
    if (!released) await transaction(async (tx) => { await tx.maintenanceLease.updateMany({ where: { name: NAME, owner }, data: { owner: null, expiresAt: null } }); });
  }
}

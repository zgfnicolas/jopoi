import type { Prisma } from "../../generated/prisma/client";
import { DEMO_POLICY } from "../../shared/demo-policy";
import { utcDay } from "./coordinator";

export const CLEANUP_CATEGORIES = ["rateBuckets", "runs", "contacts", "sessions", "quotas", "leases"] as const;
export type CleanupCategory = (typeof CLEANUP_CATEGORIES)[number];
export type CleanupCounts = Record<CleanupCategory, number>;

export const MAX_ROWS_PER_RUN_AGGREGATE =
  1 +
  DEMO_POLICY.maxReceiptsPerRun +
  DEMO_POLICY.maxRunIntentsPerSession +
  DEMO_POLICY.maxEventsPerRun * 2 +
  DEMO_POLICY.maxEventsPerRun * DEMO_POLICY.maxSubmissionAttemptsPerEvent;
export const MAX_CASCADE_ROWS_PER_BATCH = 6000;
export const RUN_BATCH_SIZE = Math.floor(MAX_CASCADE_ROWS_PER_BATCH / MAX_ROWS_PER_RUN_AGGREGATE);

export const CLEANUP_POLICY = {
  cooperativeBudgetMs: 45_000,
  closingReserveMs: 14_000,
  retentionTargetMs: 36 * 3_600_000,
  maxRounds: 12,
  runsSubBatchesPerRound: DEMO_POLICY.maxRunsPerSession,
  batchLimits: {
    rateBuckets: 250,
    runs: RUN_BATCH_SIZE,
    contacts: 25,
    sessions: 25,
    quotas: 25,
    leases: 25,
  },
} as const;

export function emptyCleanupCounts(): CleanupCounts {
  return { runs: 0, contacts: 0, sessions: 0, quotas: 0, leases: 0, rateBuckets: 0 };
}

export async function cleanCategoryBatch(tx: Prisma.TransactionClient, category: CleanupCategory, at: Date): Promise<number> {
  if (category === "rateBuckets") {
    return tx.$executeRaw`DELETE FROM "RequestRateBucket" WHERE ("scope","subject","windowStart") IN
      (SELECT "scope","subject","windowStart" FROM "RequestRateBucket"
       WHERE "expiresAt" <= ${at.toISOString()}::timestamptz
       ORDER BY "expiresAt" ASC, "scope" ASC, "subject" ASC, "windowStart" ASC
       LIMIT ${CLEANUP_POLICY.batchLimits.rateBuckets})`;
  }
  if (category === "runs") {
    const eligible: Prisma.DemoRunWhereInput = {
      expiresAt: { lte: at },
      events: { none: { publication: { is: { leaseExpiresAt: { gt: at } } } } },
    };
    const rows = await tx.demoRun.findMany({
      where: eligible,
      orderBy: [{ expiresAt: "asc" }, { sessionId: "asc" }, { ordinal: "asc" }],
      take: CLEANUP_POLICY.batchLimits.runs,
      select: { id: true },
    });
    return rows.length
      ? (await tx.demoRun.deleteMany({ where: { ...eligible, id: { in: rows.map((r) => r.id) } } })).count
      : 0;
  }
  if (category === "contacts") {
    const rows = await tx.demoRequest.findMany({
      where: { expiresAt: { lte: at } },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: CLEANUP_POLICY.batchLimits.contacts,
      select: { id: true },
    });
    return rows.length ? (await tx.demoRequest.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } })).count : 0;
  }
  if (category === "sessions") {
    const eligible: Prisma.DemoSessionWhereInput = { expiresAt: { lte: at }, runs: { none: {} } };
    const rows = await tx.demoSession.findMany({
      where: eligible,
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: CLEANUP_POLICY.batchLimits.sessions,
      select: { id: true },
    });
    return rows.length
      ? (await tx.demoSession.deleteMany({ where: { ...eligible, id: { in: rows.map((r) => r.id) } } })).count
      : 0;
  }
  if (category === "quotas") {
    const cutoff = new Date(utcDay(at).getTime() - 8 * 86_400_000);
    const rows = await tx.dailyQuota.findMany({
      where: { date: { lt: cutoff } },
      orderBy: [{ date: "asc" }, { scope: "asc" }],
      take: CLEANUP_POLICY.batchLimits.quotas,
      select: { scope: true, date: true },
    });
    return rows.length ? (await tx.dailyQuota.deleteMany({ where: { OR: rows } })).count : 0;
  }
  const eligible: Prisma.HcsPublicationWhereInput = { leaseExpiresAt: { lte: at } };
  const rows = await tx.hcsPublication.findMany({
    where: eligible,
    orderBy: [{ leaseExpiresAt: "asc" }, { eventId: "asc" }],
    take: CLEANUP_POLICY.batchLimits.leases,
    select: { eventId: true },
  });
  return rows.length
    ? (
        await tx.hcsPublication.updateMany({
          where: { ...eligible, eventId: { in: rows.map((r) => r.eventId) } },
          data: { leaseOwner: null, leaseExpiresAt: null },
        })
      ).count
    : 0;
}

export async function observeCleanupState(
  tx: Prisma.TransactionClient,
  at: Date,
  execution?: { counts: CleanupCounts; failedCategories: ReadonlySet<CleanupCategory> },
) {
  const quotaCutoff = new Date(utcDay(at).getTime() - 8 * 86_400_000);
  const expiredSessionsWhere: Prisma.DemoSessionWhereInput = {
    expiresAt: { lte: at },
    runs: { every: { expiresAt: { lte: at } } },
  };
  const pending: CleanupCounts = {
    runs: await tx.demoRun.count({ where: { expiresAt: { lte: at } } }),
    contacts: await tx.demoRequest.count({ where: { expiresAt: { lte: at } } }),
    sessions: await tx.demoSession.count({ where: expiredSessionsWhere }),
    quotas: await tx.dailyQuota.count({ where: { date: { lt: quotaCutoff } } }),
    leases: await tx.hcsPublication.count({ where: { leaseExpiresAt: { lte: at } } }),
    rateBuckets: await tx.requestRateBucket.count({ where: { expiresAt: { lte: at } } }),
  };
  const oldestRun = (await tx.demoRun.findFirst({ where: { expiresAt: { lte: at } }, orderBy: { expiresAt: "asc" }, select: { expiresAt: true } }))?.expiresAt;
  const oldestStandaloneSession = (await tx.demoSession.findFirst({ where: { expiresAt: { lte: at }, runs: { none: {} } }, orderBy: { expiresAt: "asc" }, select: { expiresAt: true } }))?.expiresAt;
  const oldestQuotaRow = await tx.dailyQuota.findFirst({ where: { date: { lt: quotaCutoff } }, orderBy: { date: "asc" }, select: { date: true } });
  const oldestByCategory: Record<CleanupCategory, Date | undefined> = {
    rateBuckets: (await tx.requestRateBucket.findFirst({ where: { expiresAt: { lte: at } }, orderBy: { expiresAt: "asc" }, select: { expiresAt: true } }))?.expiresAt,
    runs: oldestRun,
    contacts: (await tx.demoRequest.findFirst({ where: { expiresAt: { lte: at } }, orderBy: { expiresAt: "asc" }, select: { expiresAt: true } }))?.expiresAt,
    sessions: oldestStandaloneSession ?? (pending.sessions > 0 ? oldestRun : undefined),
    quotas: oldestQuotaRow ? new Date(oldestQuotaRow.date.getTime() + 9 * 86_400_000) : undefined,
    leases: (await tx.hcsPublication.findFirst({ where: { leaseExpiresAt: { lte: at } }, orderBy: { leaseExpiresAt: "asc" }, select: { leaseExpiresAt: true } }))?.leaseExpiresAt ?? undefined,
  };
  const timestamps = Object.values(oldestByCategory).filter((d): d is Date => d instanceof Date);
  const oldestMs = timestamps.length > 0 ? Math.min(...timestamps.map((d) => d.getTime())) : at.getTime();
  const oldestExpiredAgeMs = Math.max(0, Math.round(at.getTime() - oldestMs));
  const withinRetentionTarget = oldestExpiredAgeMs <= CLEANUP_POLICY.retentionTargetMs;
  const eligibleRuns = pending.runs > 0
    ? await tx.demoRun.count({ where: { expiresAt: { lte: at }, events: { none: { publication: { is: { leaseExpiresAt: { gt: at } } } } } } })
    : 0;
  const eligibleSessions = pending.sessions > 0
    ? await tx.demoSession.count({ where: { expiresAt: { lte: at }, runs: { none: {} } } })
    : 0;
  const stalledCategories = CLEANUP_CATEGORIES.filter((cat) => {
    if (execution?.failedCategories.has(cat)) return true;
    if (pending[cat] === 0) return false;
    if (cat === "runs" && eligibleRuns === 0) return true;
    if (cat === "sessions" && eligibleSessions === 0 && eligibleRuns === 0) return true;
    if (execution) return execution.counts[cat] === 0;
    const oldest = oldestByCategory[cat];
    return oldest !== undefined && at.getTime() - oldest.getTime() > CLEANUP_POLICY.retentionTargetMs;
  });
  const cleanupComplete = (execution?.failedCategories.size ?? 0) === 0 && CLEANUP_CATEGORIES.every((cat) => pending[cat] === 0);
  return { pending, oldestExpiredAgeMs, withinRetentionTarget, stalledCategories, cleanupComplete };
}

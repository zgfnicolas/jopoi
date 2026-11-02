import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Prisma } from "../../generated/prisma/client";
import { ApplicationError } from "../application-error";
import { logDiagnostic } from "../diagnostics";
import { createCoordinator, utcDay, type CoordinationContext } from "./coordinator";
import {
  CLEANUP_CATEGORIES,
  CLEANUP_POLICY,
  cleanCategoryBatch,
  emptyCleanupCounts,
  observeCleanupState,
  type CleanupCategory,
} from "./maintenance-policy";

const NAME = "DAILY_MAINTENANCE";

/** Shared by authenticated cron and explicit admin CLI. Each category is bounded and interleaved fairly. */
export async function runMaintenance(context: CoordinationContext, force = false) {
  const { transaction, now } = context;
  const monotonicStarted = performance.now();
  const durationMs = () => Math.round(performance.now() - monotonicStarted);
  const started = now().getTime(),
    deadline = started + CLEANUP_POLICY.cooperativeBudgetMs,
    owner = randomUUID();
  const claimed = await transaction(async (tx) => {
    await tx.maintenanceLease.upsert({ where: { name: NAME }, create: { name: NAME }, update: {} });
    return (
      (
        await tx.maintenanceLease.updateMany({
          where: {
            name: NAME,
            AND: [
              { OR: [{ expiresAt: null }, { expiresAt: { lte: now() } }] },
              ...(force ? [] : [{ OR: [{ lastCompletedDate: null }, { lastCompletedDate: { lt: utcDay(now()) } }] }]),
            ],
          },
          data: { owner, expiresAt: new Date(started + 120_000) },
        })
      ).count === 1
    );
  });
  if (!claimed) return { skipped: true as const, executionId: owner, durationMs: durationMs() };
  const counts = emptyCleanupCounts();
  const exhausted = new Set<CleanupCategory>();
  const failedCategories = new Set<CleanupCategory>();
  let released = false;
  const canClean = () => now().getTime() + CLEANUP_POLICY.closingReserveMs <= deadline;
  async function fenced(tx: Prisma.TransactionClient) {
    const lease = await tx.maintenanceLease.findUnique({ where: { name: NAME } });
    if (!lease || lease.owner !== owner || !lease.expiresAt || lease.expiresAt <= now()) {
      throw new ApplicationError("STATE_CONFLICT");
    }
  }
  try {
    for (let round = 0; round < CLEANUP_POLICY.maxRounds && canClean(); round++) {
      for (const category of CLEANUP_CATEGORIES) {
        if (exhausted.has(category) || failedCategories.has(category) || !canClean()) continue;
        const subBatches = category === "runs" ? CLEANUP_POLICY.runsSubBatchesPerRound : 1;
        try {
          for (let sub = 0; sub < subBatches && canClean(); sub++) {
            const deleted = await transaction(async (tx) => {
              await fenced(tx);
              return cleanCategoryBatch(tx, category, now());
            });
            counts[category] += deleted;
            if (deleted < CLEANUP_POLICY.batchLimits[category]) {
              if (category !== "sessions" || exhausted.has("runs")) exhausted.add(category);
              break;
            }
          }
        } catch (error) {
          if (error instanceof ApplicationError && error.code === "STATE_CONFLICT") throw error;
          failedCategories.add(category);
          logDiagnostic({
            event: "background.completed",
            outcome: "error",
            severity: "ERROR",
            code: "MAINTENANCE_CATEGORY_FAILED",
            durationMs: durationMs(),
            error,
          });
        }
      }
      if (CLEANUP_CATEGORIES.every((cat) => exhausted.has(cat) || failedCategories.has(cat))) break;
    }
    const observation = await transaction(async (tx) => {
      await fenced(tx);
      return observeCleanupState(tx, now(), { counts, failedCategories });
    });
    let publications = { processed: 0, hasMore: true };
    let publicationError: string | null = null;
    try {
      publications = await createCoordinator(context).drain({ maxEvents: 10, deadline: deadline - 7000 });
    } catch (error) {
      publicationError = "PUBLICATION_WORK_PENDING";
      logDiagnostic({
        event: "background.completed",
        outcome: "error",
        severity: "ERROR",
        code: "PUBLICATION_WORK_PENDING",
        durationMs: durationMs(),
        error,
      });
    }
    const complete = observation.cleanupComplete && !publications.hasMore && publicationError === null;
    const finishedAt = now();
    const leaseState = await transaction(async (tx) => {
      await fenced(tx);
      return tx.maintenanceLease.update({
        where: { name: NAME },
        data: {
          ...(complete
            ? { lastCompletedDate: utcDay(finishedAt), lastCompletedAt: finishedAt }
            : { lastPartialAt: finishedAt }),
          owner: null,
          expiresAt: null,
        },
        select: { lastCompletedAt: true, lastPartialAt: true },
      });
    });
    released = true;
    return {
      skipped: false as const,
      executionId: owner,
      durationMs: durationMs(),
      counts,
      pending: observation.pending,
      oldestExpiredAgeMs: observation.oldestExpiredAgeMs,
      withinRetentionTarget: observation.withinRetentionTarget,
      stalledCategories: observation.stalledCategories,
      lastCompletedAt: leaseState.lastCompletedAt?.toISOString() ?? null,
      lastPartialAt: leaseState.lastPartialAt?.toISOString() ?? null,
      cleanupComplete: observation.cleanupComplete,
      publications,
      publicationError,
      complete,
    };
  } finally {
    if (!released) {
      await transaction(async (tx) => {
        await tx.maintenanceLease.updateMany({ where: { name: NAME, owner }, data: { owner: null, expiresAt: null } });
      });
    }
  }
}

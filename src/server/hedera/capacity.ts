import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import { ApplicationError } from "../application-error";

/**
 * Shared admission for costly external calls (HCS preparation/submission/receipt and mirror reads).
 * Distinct from each publication lease, the daily HCS quota and the 3+1 attempt limit.
 */
export const EXTERNAL_CAPACITY_POLICY = Object.freeze({
  /** Initial global ceiling of costly external calls in flight (D15). */
  slots: 2,
  /** Expiry/fencing window; covers the worst bounded external sequence of one holder. */
  permitTtlMs: 60_000,
  /** Minimum wait before a deferred publication becomes eligible again. */
  busyCooldownMs: 15_000,
  /** Serialization conflicts between instances are retried a bounded number of times. */
  acquireAttempts: 3,
});

export const CAPACITY_SLOT_PREFIX = "EXTERNAL_CAPACITY_";
export type CapacityTransaction = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
export interface CapacityPermit { readonly slot: string; readonly owner: string; readonly expiresAt: Date }
export interface ExternalCapacity {
  acquire(): Promise<CapacityPermit | null>;
  release(permit: CapacityPermit): Promise<void>;
}

/** Each permit is a short SQL claim; no SQL transaction stays open while the permit is used. */
export function createExternalCapacity(dependencies: {
  transaction: CapacityTransaction;
  now: () => Date;
  policy?: typeof EXTERNAL_CAPACITY_POLICY;
}): ExternalCapacity {
  const { transaction, now } = dependencies;
  const policy = dependencies.policy ?? EXTERNAL_CAPACITY_POLICY;
  const names = Array.from({ length: policy.slots }, (_, index) => `${CAPACITY_SLOT_PREFIX}${index}`);
  async function acquire(): Promise<CapacityPermit | null> {
    for (let attempt = 1; attempt <= policy.acquireAttempts; attempt++) {
      const owner = randomUUID();
      try {
        return await transaction(async (tx) => {
          await tx.maintenanceLease.createMany({ data: names.map((name) => ({ name })), skipDuplicates: true });
          const at = now();
          const expiresAt = new Date(at.getTime() + policy.permitTtlMs);
          for (const name of names) {
            const changed = await tx.maintenanceLease.updateMany({
              where: { name, OR: [{ owner: null }, { expiresAt: null }, { expiresAt: { lte: at } }] },
              data: { owner, expiresAt },
            });
            if (changed.count === 1) return { slot: name, owner, expiresAt };
          }
          return null;
        });
      } catch (error) {
        // Another instance claimed concurrently: retry, then report saturation instead of waiting.
        if (!(error instanceof ApplicationError && error.code === "VERSION_CONFLICT")) throw error;
      }
    }
    return null;
  }
  async function release(permit: CapacityPermit): Promise<void> {
    // Fenced: an expired holder cannot free a slot already reclaimed by its successor.
    await transaction((tx) => tx.maintenanceLease.updateMany({
      where: { name: permit.slot, owner: permit.owner },
      data: { owner: null, expiresAt: null },
    }));
  }
  return { acquire, release };
}

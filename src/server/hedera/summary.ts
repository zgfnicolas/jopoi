import type { HcsPublication, Prisma } from "../../generated/prisma/client";
import type { PublicationSummary } from "../../shared/event-contracts";
import { HCS_CODES } from "./contracts";
import { quotaSummary } from "./coordinator";
import type { Environment } from "../config/environment";

export const publicationSummarySelect = {
  state: true, verificationState: true, network: true, topicId: true, transactionId: true,
  sequenceNumber: true, consensusTimestamp: true, confirmedAt: true, verifiedAt: true, lastErrorCode: true,
  automaticAttempts: true, manualAttempts: true, manualAuthorizedAt: true, nextAttemptAt: true,
} as const;
type SummaryRow = Pick<HcsPublication, keyof typeof publicationSummarySelect>;

/** Explicit allowlist, never serialize the publication model. */
export function publicationSummary(row: SummaryRow, coordination: Pick<PublicationSummary, "blockedBy" | "quota">): PublicationSummary {
  return {
    ...coordination,
    state: row.state, verificationState: row.verificationState, network: "testnet",
    topicId: row.topicId, transactionId: row.transactionId, sequenceNumber: row.sequenceNumber?.toString() ?? null,
    consensusTimestamp: row.consensusTimestamp, confirmedAt: row.confirmedAt?.toISOString() ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    lastErrorCode: HCS_CODES.find((code) => code === row.lastErrorCode) ?? null,
    automaticAttempts: row.automaticAttempts, manualAttempts: row.manualAttempts,
    manualAuthorized: row.manualAuthorizedAt !== null,
    manualAvailable: coordination.blockedBy === null && row.state === "FAILED" && row.automaticAttempts === 3 && row.manualAttempts === 0,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
  };
}

export async function privatePublicationSummary(tx: Prisma.TransactionClient, row: SummaryRow,
  event: { runId: string; ordinal: number }, environment: Environment, now: Date): Promise<PublicationSummary> {
  const blockedBy = (await tx.operationEvent.findFirst({ where: { runId: event.runId, ordinal: { lt: event.ordinal },
    publication: { is: { state: { not: "CONFIRMED" } } } }, orderBy: { ordinal: "asc" }, select: { id: true } }))?.id ?? null;
  return publicationSummary(row, { blockedBy, quota: await quotaSummary(tx, environment, now) });
}

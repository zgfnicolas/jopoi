import type { HcsPublication } from "../../generated/prisma/client";
import type { PublicationSummary } from "../../shared/event-contracts";
import { HCS_CODES } from "./contracts";

export const publicationSummarySelect = {
  state: true, verificationState: true, network: true, topicId: true, transactionId: true,
  sequenceNumber: true, consensusTimestamp: true, confirmedAt: true, verifiedAt: true, lastErrorCode: true,
} as const;
type SummaryRow = Pick<HcsPublication, keyof typeof publicationSummarySelect>;

/** Explicit allowlist, never serialize the publication model. */
export function publicationSummary(row: SummaryRow): PublicationSummary {
  return {
    state: row.state, verificationState: row.verificationState, network: "testnet",
    topicId: row.topicId, transactionId: row.transactionId, sequenceNumber: row.sequenceNumber?.toString() ?? null,
    consensusTimestamp: row.consensusTimestamp, confirmedAt: row.confirmedAt?.toISOString() ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    lastErrorCode: HCS_CODES.find((code) => code === row.lastErrorCode) ?? null,
  };
}

import type { HcsEventEnvelope, PublicationSummary } from "../../shared/event-contracts";
import type { HcsTarget } from "./target";

export const HCS_CODES = [
  "HCS_CONFIG_MISSING", "HCS_CONFIG_CHANGED", "HCS_INVALID_KEY", "HCS_INVALID_OPERATOR",
  "HCS_INVALID_TOPIC", "HCS_TOPIC_FEES", "HCS_INSUFFICIENT_TEST_BALANCE", "HCS_INVALID_PREPARATION",
  "HCS_TRANSACTION_EXPIRED", "HCS_TRANSACTION_REJECTED", "HCS_RESULT_UNKNOWN", "HCS_UNAVAILABLE",
  "HCS_MIRROR_PENDING", "HCS_MIRROR_UNAVAILABLE", "HCS_MESSAGE_MISMATCH", "HCS_INVALID_EVIDENCE",
  "HCS_QUOTA_EXHAUSTED", "HCS_ATTEMPTS_EXHAUSTED",
] as const;
export type HcsCode = typeof HCS_CODES[number];
export class HcsError extends Error {
  constructor(readonly code: HcsCode) { super(code); this.name = "HcsError"; }
}

export interface PreparedMessage {
  readonly target: HcsTarget;
  readonly transactionId: string;
  readonly signedBytes: Uint8Array;
  readonly envelope: HcsEventEnvelope;
}
export type NetworkOutcome =
  | { readonly kind: "confirmed"; readonly sequenceNumber: string | null; readonly consensusTimestamp: string | null; readonly topicId: string | null }
  | { readonly kind: "rejected"; readonly code: HcsCode; readonly source: "PRECHECK" | "RECEIPT" | "MIRROR" }
  | { readonly kind: "not_sent"; readonly code: HcsCode }
  | { readonly kind: "unknown"; readonly code: HcsCode };

export interface VerificationEvidence {
  readonly version: 1;
  readonly observedAt: string;
  readonly topicId: string;
  readonly transactionId: string;
  readonly sequenceNumber: string | null;
  readonly consensusTimestamp: string | null;
  readonly localDigest: string;
  readonly remoteDigest: string | null;
  readonly identifiersMatch: boolean;
  readonly digestMatch: boolean;
}
export interface VerificationResult {
  readonly state: Exclude<PublicationSummary["verificationState"], "NOT_CHECKED">;
  readonly code: HcsCode | null;
  readonly evidence: VerificationEvidence;
}

/** External seam: production SDK/mirror implementation; S17 replaces only this boundary. */
export interface HcsProvider {
  prepare(target: HcsTarget, envelope: HcsEventEnvelope, bytes: Uint8Array): Promise<PreparedMessage>;
  submit(prepared: PreparedMessage): Promise<{ kind: "accepted" } | Exclude<NetworkOutcome, { kind: "confirmed" }>>;
  reconcile(transactionId: string, topicId: string): Promise<NetworkOutcome>;
  verify(prepared: PreparedMessage, sequenceNumber: string | null, confirmedAt: Date | null): Promise<VerificationResult>;
}

import type { Environment } from "../config/environment";
import { HcsError, preserveHcsCause, type HcsProvider, type NetworkOutcome } from "./contracts";
import { currentRequestContext, logDiagnostic } from "../diagnostics";
import { lookupTransaction, verifyMessage } from "./mirror";
import { prepareMessage, queryReceipt, submitMessage } from "./sdk";

export function createHcsProvider(environment: Environment): HcsProvider {
  return {
    prepare: (target, envelope, bytes) => prepareMessage(environment, target, envelope, bytes),
    submit: (prepared) => submitMessage(environment, prepared),
    async reconcile(id, topicId) {
      const receipt = await queryReceipt(id);
      if (receipt.kind === "rejected") return receipt;
      try {
        const mirror = await lookupTransaction(id, topicId);
        if (receipt.kind === "confirmed") {
          return mirror.kind === "confirmed" ? { ...receipt, consensusTimestamp: mirror.consensusTimestamp } : receipt;
        }
        return mirror;
      } catch (error) {
        const code = error instanceof HcsError ? error.code : "HCS_UNAVAILABLE";
        if (currentRequestContext()) logDiagnostic({ event: "publication.recovered", outcome: "partial", severity: "WARN", code, durationMs: 0, error });
        if (receipt.kind === "confirmed") return preserveHcsCause(receipt, error);
        return preserveHcsCause<NetworkOutcome>({ kind: "unknown", code }, error);
      }
    },
    verify: (prepared, sequenceNumber, confirmedAt) => verifyMessage({
      transactionId: prepared.transactionId, topicId: prepared.target.topicId,
      envelope: prepared.envelope, sequenceNumber, confirmedAt,
    }),
  };
}

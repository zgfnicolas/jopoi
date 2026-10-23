import type { Environment } from "../config/environment";
import { HcsError, type HcsProvider } from "./contracts";
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
        if (receipt.kind === "confirmed") return receipt;
        return { kind: "unknown", code: error instanceof HcsError ? error.code : "HCS_UNAVAILABLE" };
      }
    },
    verify: (prepared, sequenceNumber, confirmedAt) => verifyMessage({
      transactionId: prepared.transactionId, topicId: prepared.target.topicId,
      envelope: prepared.envelope, sequenceNumber, confirmedAt,
    }),
  };
}

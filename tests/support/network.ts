import type { Environment } from "../../src/server/config/environment";
import type { HcsProvider, PreparedMessage, VerificationResult } from "../../src/server/hedera/contracts";
import type { verifyMessage as RealVerify } from "../../src/server/hedera/mirror";
import { rpc } from "./ipc";

function request<T>(operation: string, data: unknown): Promise<T> {
  if (!process.env.JOPOI_API_TEST_SOCKET || process.env.VERCEL) throw new Error("API_TEST_NETWORK_FORBIDDEN");
  return rpc<T>(process.env.JOPOI_API_TEST_SOCKET, operation, data);
}
export function createHcsProvider(_environment: Environment): HcsProvider {
  return {
    async prepare(target, envelope, bytes) {
      const prepared = await request<Omit<PreparedMessage, "signedBytes">>("prepare", { target, envelope, bytes: [...bytes] });
      return { ...prepared, signedBytes: Buffer.from("SIMULATED_NOT_A_SIGNED_TRANSACTION") };
    },
    submit: prepared => request("submit", prepared),
    reconcile: (transactionId, topicId) => request("reconcile", { transactionId, topicId }),
    verify: (prepared, sequenceNumber, confirmedAt) => request("verify", { transactionId: prepared.transactionId,
      topicId: prepared.target.topicId, envelope: prepared.envelope, sequenceNumber, confirmedAt }),
  };
}
export const verifyMessage: typeof RealVerify = input => request<VerificationResult>("verify", input);

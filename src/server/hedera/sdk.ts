// Private Node module shared by the server-only service and the administrative CLI.
// No environment reads, clients or network activity at import time.
import {
  AccountId, AccountInfoQuery, Client, Hbar, PrecheckStatusError, PrivateKey, PublicKey,
  Status, TopicCreateTransaction, TopicInfoQuery, TopicMessageSubmitTransaction,
  Transaction, TransactionId, TransactionReceiptQuery,
} from "@hiero-ledger/sdk";
import { canonicalJson } from "../../domain/canonical-json";
import type { HcsEventEnvelope } from "../../shared/event-contracts";
import { createConfigReader, type Environment } from "../config/environment";
import { HcsError, preserveHcsCause, type HcsCode, type NetworkOutcome, type PreparedMessage } from "./contracts";
import { currentRequestContext, logDiagnostic } from "../diagnostics";
import type { HcsTarget } from "./target";

export function readOperator(environment: Environment) {
  const result = createConfigReader(environment).hederaOperator();
  if (result.status !== "configured") throw new HcsError("HCS_CONFIG_MISSING");
  try {
    const key = PrivateKey.fromStringDer(result.config.operatorKey);
    if (key.toStringDer().toLowerCase() !== result.config.operatorKey.toLowerCase()) throw new Error();
    return { operatorId: result.config.operatorId, key };
  } catch (error) { throw new HcsError("HCS_INVALID_KEY", { cause: error }); }
}

export async function withTestnetClient<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = Client.forTestnet();
  client.setMaxAttempts(1).setMaxNodesPerTransaction(1)
    .setDefaultRegenerateTransactionId(false)
    .setRequestTimeout(5000).setGrpcDeadline(5000)
    .setDefaultMaxTransactionFee(new Hbar(1)).setDefaultMaxQueryPayment(new Hbar(1));
  try { return await work(client); } finally { client.close(); }
}

export function statusCode(status: Status): HcsCode {
  if ([Status.Busy, Status.PlatformNotActive, Status.Unknown, Status.ReceiptNotFound].includes(status)) return "HCS_UNAVAILABLE";
  if (status === Status.InsufficientPayerBalance) return "HCS_INSUFFICIENT_TEST_BALANCE";
  if (status === Status.InvalidTopicId || status === Status.TopicExpired) return "HCS_INVALID_TOPIC";
  if (status === Status.InvalidAccountId || status === Status.PayerAccountNotFound) return "HCS_INVALID_OPERATOR";
  if (status === Status.InvalidSignature || status === Status.InvalidPayerSignature) return "HCS_INVALID_KEY";
  if (status === Status.TransactionExpired) return "HCS_TRANSACTION_EXPIRED";
  return "HCS_TRANSACTION_REJECTED";
}

export function sendFailure(error: unknown): Exclude<NetworkOutcome, { kind: "confirmed" }> {
  if (error instanceof HcsError) return networkFailure({ kind: "not_sent", code: error.code }, error);
  if (error instanceof PrecheckStatusError) {
    const status = error.status;
    if ([Status.DuplicateTransaction, Status.Unknown, Status.Busy, Status.PlatformNotActive].includes(status)) {
      return networkFailure({ kind: "unknown", code: "HCS_RESULT_UNKNOWN" }, error);
    }
    return networkFailure({ kind: "rejected", code: statusCode(status), source: "PRECHECK" }, error);
  }
  // Transport failures do not prove whether submission reached the network.
  return networkFailure({ kind: "unknown", code: "HCS_RESULT_UNKNOWN" }, error);
}
function networkFailure(result: Exclude<NetworkOutcome, { kind: "confirmed" }>, error: unknown) {
  if (currentRequestContext()) logDiagnostic({ event: "publication.recovered", code: result.code, outcome: "partial", severity: "WARN", durationMs: 0, error: new HcsError(result.code, { cause: error }) });
  return preserveHcsCause(result, error);
}

export async function validateOperator(client: Client, operator: ReturnType<typeof readOperator>): Promise<void> {
  const info = await new AccountInfoQuery().setAccountId(operator.operatorId).execute(client, 5000);
  if (!(info.key instanceof PublicKey) || !info.key.equals(operator.key.publicKey)) throw new HcsError("HCS_INVALID_OPERATOR");
}

export async function prepareMessage(environment: Environment, target: HcsTarget, envelope: HcsEventEnvelope, bytes: Uint8Array): Promise<PreparedMessage> {
  if (target.network !== "testnet" || bytes.length === 0 || bytes.length > 1024
    || !Buffer.from(bytes).equals(Buffer.from(canonicalJson(envelope), "utf8"))) throw new HcsError("HCS_INVALID_EVIDENCE");
  const operator = readOperator(environment);
  if (operator.operatorId !== target.operatorId) throw new HcsError("HCS_CONFIG_CHANGED");
  try {
    return await withTestnetClient(async (client) => {
      client.setOperator(operator.operatorId, operator.key);
      await validateOperator(client, operator);
      const topic = await new TopicInfoQuery().setTopicId(target.topicId).execute(client, 5000);
      if (topic.topicId.toString() !== target.topicId || !(topic.submitKey instanceof PublicKey)
        || !topic.submitKey.equals(operator.key.publicKey)) throw new HcsError("HCS_INVALID_TOPIC");
      if ((topic.customFees?.length ?? 0) !== 0 || topic.feeScheduleKey !== null) throw new HcsError("HCS_TOPIC_FEES");
      const tx = new TopicMessageSubmitTransaction().setTopicId(target.topicId).setMessage(bytes)
        .setChunkSize(1024).setMaxChunks(1).setMaxTransactionFee(new Hbar(1))
        .setTransactionId(TransactionId.generate(operator.operatorId))
        .setTransactionValidDuration(120).setRegenerateTransactionId(false).freezeWith(client);
      await tx.sign(operator.key);
      if (tx.getRequiredChunks() !== 1 || tx.transactionId === null) throw new HcsError("HCS_INVALID_PREPARATION");
      return { target, envelope, transactionId: tx.transactionId.toString(), signedBytes: await tx.toBytesAsync() };
    });
  } catch (error) {
    if (error instanceof HcsError) throw error;
    throw new HcsError(error instanceof PrecheckStatusError ? statusCode(error.status) : "HCS_UNAVAILABLE", { cause: error });
  }
}

export function readSignedTransaction(bytes: Uint8Array, transactionId: string, operatorId: string, publicKey: PublicKey): Transaction {
  try {
    if (bytes.length === 0 || bytes.length > 65536) throw new Error();
    const tx = Transaction.fromBytes(bytes);
    const id = tx.transactionId;
    const signatures = tx.getSignatures();
    if (id === null || id.toString() !== transactionId || id.accountId?.toString() !== operatorId
      || id.scheduled || (id.nonce !== null && !id.nonce.isZero())
      || tx.transactionValidDuration !== 120 || tx.nodeAccountIds?.length !== 1 || signatures.size !== 1
      || !publicKey.verifyTransaction(tx)) throw new Error();
    for (const map of signatures.values()) {
      if (map.size !== 1 || Array.from(map.keys()).some((item) => item.toString() !== transactionId)) throw new Error();
    }
    return tx;
  } catch (error) { throw new HcsError("HCS_INVALID_PREPARATION", { cause: error }); }
}

export function readPreparedMessage(environment: Environment, prepared: PreparedMessage): TopicMessageSubmitTransaction {
  const operator = readOperator(environment);
  const tx = readSignedTransaction(prepared.signedBytes, prepared.transactionId, prepared.target.operatorId, operator.key.publicKey);
  if (operator.operatorId !== prepared.target.operatorId || prepared.target.network !== "testnet"
    || !(tx instanceof TopicMessageSubmitTransaction) || tx.topicId?.toString() !== prepared.target.topicId
    || tx.getRequiredChunks() !== 1 || !Buffer.from(tx.getMessage() ?? []).equals(Buffer.from(canonicalJson(prepared.envelope)))
    || tx.maxTransactionFee === null || tx.maxTransactionFee.toTinybars().gt(new Hbar(1).toTinybars())) {
    throw new HcsError("HCS_INVALID_PREPARATION");
  }
  return tx;
}

export function transactionExpired(tx: Transaction): boolean {
  const start = tx.transactionId?.validStart;
  if (start === null || start === undefined) return true;
  const expiry = BigInt(start.seconds.toString()) * 1000n + BigInt(start.nanos.toString()) / 1000000n
    + BigInt(tx.transactionValidDuration) * 1000n;
  return BigInt(Date.now()) >= expiry;
}

export async function submitMessage(environment: Environment, prepared: PreparedMessage) {
  try {
    const tx = readPreparedMessage(environment, prepared);
    if (transactionExpired(tx)) return { kind: "not_sent" as const, code: "HCS_TRANSACTION_EXPIRED" as const };
    return await withTestnetClient(async (client) => {
      // No operator: bytes are already signed; execute must not add or replace signatures.
      await tx.execute(client, 5000);
      return { kind: "accepted" as const };
    });
  } catch (error) { return sendFailure(error); }
}

export async function queryReceipt(transactionId: string): Promise<NetworkOutcome> {
  try {
    return await withTestnetClient(async (client) => {
      const receipt = await new TransactionReceiptQuery().setTransactionId(transactionId)
        .setIncludeDuplicates(true).setValidateStatus(false).execute(client, 5000);
      const receipts = [receipt, ...receipt.duplicates];
      const successful = receipts.find((item) => item.status === Status.Success);
      if (successful !== undefined) return { kind: "confirmed", topicId: successful.topicId?.toString() ?? null,
        sequenceNumber: successful.topicSequenceNumber?.toString() ?? null, consensusTimestamp: null };
      const final = receipts.find((item) => ![Status.Unknown, Status.ReceiptNotFound, Status.DuplicateTransaction,
        Status.InvalidNodeAccount, Status.InvalidPayerSignature, Status.Busy, Status.PlatformNotActive].includes(item.status));
      return final === undefined ? { kind: "unknown", code: "HCS_RESULT_UNKNOWN" }
        : { kind: "rejected", code: statusCode(final.status), source: "RECEIPT" };
    });
  } catch (error) { return networkFailure({ kind: "unknown", code: "HCS_RESULT_UNKNOWN" }, error); }
}

export async function prepareTopic(environment: Environment): Promise<{ transactionId: string; operatorId: string; signedBytes: Uint8Array }> {
  const operator = readOperator(environment);
  return withTestnetClient(async (client) => {
    client.setOperator(operator.operatorId, operator.key);
    await validateOperator(client, operator);
    const tx = new TopicCreateTransaction().setAdminKey(operator.key.publicKey).setSubmitKey(operator.key.publicKey)
      .setTopicMemo("Jopoi personal demo testnet").setMaxTransactionFee(new Hbar(2))
      .setTransactionId(TransactionId.generate(AccountId.fromString(operator.operatorId)))
      .setTransactionValidDuration(120).setRegenerateTransactionId(false).freezeWith(client);
    await tx.sign(operator.key);
    if (tx.transactionId === null) throw new HcsError("HCS_INVALID_PREPARATION");
    return { transactionId: tx.transactionId.toString(), operatorId: operator.operatorId, signedBytes: await tx.toBytesAsync() };
  });
}

export function readPreparedTopic(environment: Environment, journal: { transactionId: string; operatorId: string; signedBytes: Uint8Array }): TopicCreateTransaction {
  const operator = readOperator(environment);
  const tx = readSignedTransaction(journal.signedBytes, journal.transactionId, journal.operatorId, operator.key.publicKey);
  if (operator.operatorId !== journal.operatorId || !(tx instanceof TopicCreateTransaction)
    || !(tx.getAdminKey() instanceof PublicKey) || tx.getAdminKey()?.toString() !== operator.key.publicKey.toString()
    || tx.getSubmitKey()?.toString() !== operator.key.publicKey.toString() || tx.getCustomFees().length !== 0
    || tx.getFeeScheduleKey() !== null || tx.maxTransactionFee === null
    || tx.maxTransactionFee.toTinybars().gt(new Hbar(2).toTinybars())) throw new HcsError("HCS_INVALID_PREPARATION");
  return tx;
}

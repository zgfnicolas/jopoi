import { z } from "zod";
import { canonicalJson } from "../../domain/canonical-json";
import { eventDigest, hcsEnvelopeSchema } from "../../domain/event-schemas";
import type { HcsEventEnvelope } from "../../shared/event-contracts";
import { HcsError, type NetworkOutcome, type VerificationResult } from "./contracts";

const MIRROR = "https://testnet.mirrornode.hedera.com";
const topic = z.string().max(64).regex(/^0\.0\.[1-9]\d*$/);
const timestamp = z.string().max(30).regex(/^\d{1,19}\.\d{9}$/);
const sequence = z.string().regex(/^[1-9]\d{0,18}$/).refine((value) => BigInt(value) <= 9223372036854775807n);
const transactionRow = z.object({
  transaction_id: z.string().max(128), name: z.string().max(64), result: z.string().max(64),
  entity_id: topic.nullable(), consensus_timestamp: timestamp, nonce: z.literal(0), scheduled: z.literal(false),
});
const transactionResponse = z.object({ transactions: z.array(transactionRow).max(32) });
const messageSchema = z.object({
  topic_id: topic, sequence_number: sequence, consensus_timestamp: timestamp,
  payer_account_id: topic, message: z.string().max(2048),
  chunk_info: z.object({ initial_transaction_id: z.string().max(128), number: z.literal(1), total: z.literal(1),
    nonce: z.number().int().nonnegative().optional(), scheduled: z.boolean().optional() }).nullable(),
});

export function mirrorTransactionId(id: string): string {
  const match = /^(0\.0\.[1-9]\d*)@(\d{1,19})\.(\d{9})$/.exec(id);
  if (match === null || id.length > 128) throw new HcsError("HCS_INVALID_PREPARATION");
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Bounded public endpoint, no redirects, pagination, SDK credentials or automatic retries. */
async function mirrorJson(path: string, maxBytes: number): Promise<unknown | null> {
  try {
    const response = await fetch(`${MIRROR}/api/v1/${path}`, {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3000), headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 404) return null;
      throw new HcsError("HCS_MIRROR_UNAVAILABLE");
    }
    if (response.body === null || !response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      await response.body?.cancel();
      throw new HcsError("HCS_MIRROR_UNAVAILABLE");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > maxBytes) { await reader.cancel(); throw new HcsError("HCS_MIRROR_UNAVAILABLE"); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    // Node 24 supplies the original numeric lexeme. Never round a uint64 through Number.
    return JSON.parse(text, (key: string, value: unknown, context?: { source?: string }) => {
      if (key !== "sequence_number" || typeof value !== "number") return value;
      if (context?.source === undefined || !/^[1-9]\d*$/.test(context.source)) throw new Error();
      return context.source;
    });
  } catch { throw new HcsError("HCS_MIRROR_UNAVAILABLE"); }
}

export async function lookupTransaction(id: string, expectedTopic: string | null, kind: "message" | "topic" = "message"): Promise<NetworkOutcome> {
  const mirrorId = mirrorTransactionId(id);
  const raw = await mirrorJson(`transactions/${mirrorId}?nonce=0&scheduled=false`, 262144);
  if (raw === null) return { kind: "unknown", code: "HCS_MIRROR_PENDING" };
  const result = transactionResponse.safeParse(raw);
  if (!result.success) throw new HcsError("HCS_MIRROR_UNAVAILABLE");
  const rows = result.data.transactions.filter((row) => row.transaction_id === mirrorId
    && row.name === (kind === "message" ? "CONSENSUSSUBMITMESSAGE" : "CONSENSUSCREATETOPIC"));
  const successful = rows.filter((row) => row.result === "SUCCESS");
  if (successful.length > 1) throw new HcsError("HCS_MIRROR_UNAVAILABLE");
  if (successful.length === 1) {
    const row = successful[0];
    if (row === undefined) throw new HcsError("HCS_MIRROR_UNAVAILABLE");
    if (row.entity_id === null || (expectedTopic !== null && row.entity_id !== expectedTopic)) throw new HcsError("HCS_MESSAGE_MISMATCH");
    return { kind: "confirmed", topicId: row.entity_id, sequenceNumber: null, consensusTimestamp: row.consensus_timestamp };
  }
  if (rows.some((row) => !["DUPLICATE_TRANSACTION", "UNKNOWN", "INVALID_NODE_ACCOUNT", "INVALID_PAYER_SIGNATURE"].includes(row.result))) {
    return { kind: "rejected", code: "HCS_TRANSACTION_REJECTED", source: "MIRROR" };
  }
  return { kind: "unknown", code: "HCS_RESULT_UNKNOWN" };
}

export async function verifyMessage(input: {
  transactionId: string; topicId: string; envelope: HcsEventEnvelope;
  sequenceNumber: string | null; confirmedAt: Date | null;
}): Promise<VerificationResult> {
  const evidence = {
    version: 1 as const, observedAt: new Date().toISOString(), topicId: input.topicId,
    transactionId: input.transactionId, sequenceNumber: null as string | null,
    consensusTimestamp: null as string | null, localDigest: input.envelope.digest,
    remoteDigest: null as string | null, identifiersMatch: false, digestMatch: false,
  };
  const unavailable = (pending: boolean): VerificationResult => ({ state: pending ? "PENDING" : "UNAVAILABLE",
    code: pending ? "HCS_MIRROR_PENDING" : "HCS_MIRROR_UNAVAILABLE", evidence });
  try {
    topic.parse(input.topicId);
    const lookup = await lookupTransaction(input.transactionId, input.topicId);
    if (lookup.kind !== "confirmed" || lookup.consensusTimestamp === null) {
      // A missing old receipt/message does not erase historical confirmation or prove a reset.
      return unavailable(input.confirmedAt === null || Date.now() - input.confirmedAt.getTime() < 180000);
    }
    const raw = await mirrorJson(`topics/messages/${lookup.consensusTimestamp}`, 65536);
    if (raw === null) return unavailable(input.confirmedAt === null || Date.now() - input.confirmedAt.getTime() < 180000);
    const message = messageSchema.safeParse(raw);
    if (!message.success) throw new HcsError("HCS_MIRROR_UNAVAILABLE");
    const row = message.data;
    evidence.sequenceNumber = row.sequence_number;
    evidence.consensusTimestamp = row.consensus_timestamp;
    const encoded = row.message;
    let remote: unknown = null;
    try {
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error();
      const bytes = Buffer.from(encoded, "base64");
      if (bytes.length === 0 || bytes.length > 1024 || bytes.toString("base64") !== encoded) throw new Error();
      remote = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch { return { state: "MISMATCH", code: "HCS_MESSAGE_MISMATCH", evidence }; }
    const parsed = hcsEnvelopeSchema.safeParse(remote);
    if (remote !== null && typeof remote === "object" && "digest" in remote) {
      const digest = eventDigest.safeParse(remote.digest);
      evidence.remoteDigest = digest.success ? digest.data : null;
    }
    const sameTransaction = row.chunk_info === null
      || (row.chunk_info.initial_transaction_id === mirrorTransactionId(input.transactionId)
        && !row.chunk_info.scheduled && (row.chunk_info.nonce ?? 0) === 0);
    evidence.identifiersMatch = row.topic_id === input.topicId
      && row.payer_account_id === input.transactionId.split("@", 1)[0]
      && row.consensus_timestamp === lookup.consensusTimestamp
      && (input.sequenceNumber === null || row.sequence_number === input.sequenceNumber)
      && sameTransaction && parsed.success
      && parsed.data.eventId === input.envelope.eventId && parsed.data.traceId === input.envelope.traceId
      && parsed.data.ordinal === input.envelope.ordinal && parsed.data.type === input.envelope.type
      && parsed.data.role === input.envelope.role;
    evidence.digestMatch = evidence.remoteDigest === input.envelope.digest;
    const matches = evidence.identifiersMatch && evidence.digestMatch && parsed.success
      && canonicalJson(parsed.data) === canonicalJson(input.envelope);
    return { state: matches ? "MATCHED" : "MISMATCH", code: matches ? null : "HCS_MESSAGE_MISMATCH", evidence };
  } catch (error) {
    if (error instanceof HcsError && error.code === "HCS_MESSAGE_MISMATCH") {
      return { state: "MISMATCH", code: "HCS_MESSAGE_MISMATCH", evidence };
    }
    return unavailable(false);
  }
}

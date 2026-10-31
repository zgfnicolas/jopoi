import { createServer, type Server } from "node:net";
import { readFileSync } from "node:fs";
import type { HcsEventEnvelope } from "../../src/shared/event-contracts";
import type { HcsTarget } from "../../src/server/hedera/target";

export type NetworkMode = "confirmed" | "rejected" | "unknown" | "timeout" | "mirror-lag" | "altered" | "suspended" | "hold" | "prepare-hold" | "malformed-verification";
interface Message { transactionId: string; target: HcsTarget; envelope: HcsEventEnvelope; submitted: boolean; mode: NetworkMode; sequence: number; consensusTimestamp: string | null }

/** Simulated external ledger, independent of SQL and of the application's coordinator. */
export async function ledger(socket: string, clockFile: string): Promise<Server> {
  let mode: NetworkMode = "confirmed";
  let counter = 0;
  let sequence = 0;
  const messages = new Map<string, Message>();
  const submissions: string[] = [];
  const held: Array<() => void> = [];
  const time = () => JSON.parse(readFileSync(clockFile, "utf8")) as string;
  const server = createServer(connection => {
    let input = "";
    connection.on("error", () => {});
    connection.on("data", async chunk => {
      input += chunk;
      if (!input.includes("\n")) return;
      connection.pause();
      try {
        const { operation, data } = JSON.parse(input.slice(0, input.indexOf("\n")));
        let value: unknown;
        if (operation === "control") {
          if (data.reset) { messages.clear(); submissions.length = 0; sequence = 0; }
          mode = data.mode ?? mode;
          if (data.release) held.splice(0).forEach(release => release());
          value = true;
        } else if (operation === "inspect") {
          value = { submissions: [...submissions], messages: [...messages.values()] };
        } else if (operation === "prepare") {
          const transactionId = `0.0.17@${Math.floor(new Date(time()).getTime() / 1000)}.${String(++counter).padStart(9, "0")}`;
          const message: Message = { ...data, transactionId, submitted: false, mode, sequence: 0, consensusTimestamp: null };
          messages.set(transactionId, message);
          if (mode === "prepare-hold") await new Promise<void>(resolve => held.push(resolve));
          value = { target: data.target, envelope: data.envelope, transactionId };
        } else if (operation === "submit") {
          const message = messages.get(data.transactionId)!;
          submissions.push(data.transactionId);
          if (!message.submitted) {
            message.submitted = true;
            message.mode = mode;
            if (mode !== "rejected") {
              message.sequence = ++sequence;
              message.consensusTimestamp = `${Math.floor(new Date(time()).getTime() / 1000)}.000000000`;
            }
          }
          if (mode === "hold") await new Promise<void>(resolve => held.push(resolve));
          value = mode === "rejected" ? { kind: "rejected", code: "HCS_TRANSACTION_REJECTED", source: "PRECHECK" }
            : { kind: "unknown", code: mode === "timeout" ? "HCS_UNAVAILABLE" : "HCS_RESULT_UNKNOWN" };
        } else if (operation === "reconcile") {
          const message = messages.get(data.transactionId);
          value = mode === "suspended" || mode === "unknown" || mode === "timeout" || mode === "hold" || !message?.submitted
            ? { kind: "unknown", code: "HCS_UNAVAILABLE" }
            : message.mode === "rejected" ? { kind: "rejected", code: "HCS_TRANSACTION_REJECTED", source: "PRECHECK" }
            : { kind: "confirmed", sequenceNumber: String(message.sequence), consensusTimestamp: message.consensusTimestamp, topicId: message.target.topicId };
        } else if (operation === "verify") {
          const message = messages.get(data.transactionId);
          const unavailable = ["suspended", "unknown", "timeout", "hold"].includes(mode) || !message?.consensusTimestamp;
          const pending = mode === "mirror-lag";
          const identifiersMatch = !!message && message.target.topicId === data.topicId;
          const digestMatch = !!message && message.envelope.digest === data.envelope.digest;
          const mismatch = mode === "altered" || !identifiersMatch || !digestMatch;
          value = {
            state: unavailable ? "UNAVAILABLE" : pending ? "PENDING" : mismatch ? "MISMATCH" : "MATCHED",
            code: unavailable ? "HCS_MIRROR_UNAVAILABLE" : pending ? "HCS_MIRROR_PENDING" : mismatch ? "HCS_MESSAGE_MISMATCH" : null,
            evidence: { version: 1, observedAt: time(), topicId: data.topicId, transactionId: data.transactionId,
              sequenceNumber: unavailable || pending ? null : String(message!.sequence),
              consensusTimestamp: unavailable || pending ? null : message!.consensusTimestamp,
              localDigest: data.envelope.digest, remoteDigest: unavailable || pending ? null : mismatch ? "0".repeat(64) : message!.envelope.digest,
              identifiersMatch: !unavailable && !pending && identifiersMatch, digestMatch: !unavailable && !pending && !mismatch },
          };
          if (mode === "malformed-verification") value = null;
        } else throw new Error("UNKNOWN_TEST_OPERATION");
        connection.end(JSON.stringify({ value }) + "\n");
      } catch { connection.end(JSON.stringify({ error: "TEST_LEDGER_ERROR" }) + "\n"); }
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(socket, resolve); });
  return server;
}

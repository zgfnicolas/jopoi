import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, unlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { loadCliEnvironment } from "../src/server/config/cli-environment";
import { HcsError, type NetworkOutcome } from "../src/server/hedera/contracts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIRECTORY = resolve(ROOT, ".cache/hedera");
const journalSchema = z.strictObject({
  version: z.literal(1), network: z.literal("testnet"), kind: z.literal("CREATE_TOPIC"),
  transactionId: z.string().max(128).regex(/^0\.0\.[1-9]\d*@\d{1,19}\.\d{9}$/),
  operatorId: z.string().max(64).regex(/^0\.0\.[1-9]\d*$/),
  signedTransactionBytes: z.string().min(1).max(90000), preparedAt: z.iso.datetime(),
});

async function requireDirectory(): Promise<void> {
  if (await realpath(DIRECTORY) !== DIRECTORY) throw new HcsError("HCS_INVALID_PREPARATION");
}

async function newPrivateFile(path: string, value: object): Promise<void> {
  const file = await open(path, "wx", 0o600);
  try { await file.writeFile(JSON.stringify(value) + "\n", "utf8"); await file.sync(); }
  catch (error) { await file.close(); await unlink(path); throw error; }
  await file.close();
}

async function readJournal(input: string) {
  await requireDirectory();
  const path = resolve(ROOT, input);
  const child = relative(DIRECTORY, path);
  if (child === "" || child.startsWith("..") || isAbsolute(child) || dirname(path) !== DIRECTORY) throw new HcsError("HCS_INVALID_PREPARATION");
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 131072 || await realpath(path) !== path) throw new HcsError("HCS_INVALID_PREPARATION");
  const journal = journalSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const bytes = Buffer.from(journal.signedTransactionBytes, "base64");
  if (bytes.length > 65536 || bytes.toString("base64") !== journal.signedTransactionBytes
    || journal.transactionId.split("@", 1)[0] !== journal.operatorId) throw new HcsError("HCS_INVALID_PREPARATION");
  return { path, journal, signedBytes: Uint8Array.from(bytes) };
}

async function topicStatus(transactionId: string): Promise<NetworkOutcome> {
  const { queryReceipt } = await import("../src/server/hedera/sdk");
  const receipt = await queryReceipt(transactionId);
  if (receipt.kind === "confirmed" && receipt.topicId !== null || receipt.kind === "rejected") return receipt;
  const { lookupTransaction } = await import("../src/server/hedera/mirror");
  try { return await lookupTransaction(transactionId, null, "topic"); }
  catch { return { kind: "unknown", code: "HCS_MIRROR_UNAVAILABLE" }; }
}

function printStatus(transactionId: string, outcome: NetworkOutcome): void {
  console.log(JSON.stringify({ code: outcome.kind === "confirmed" ? "TOPIC_CONFIRMED"
    : outcome.kind === "rejected" ? outcome.code : "TOPIC_RESULT_UNKNOWN",
  network: "testnet", transactionId, topicId: outcome.kind === "confirmed" ? outcome.topicId : null }));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help")) {
    console.log([
      "Uso: npm run hedera:topic -- prepare",
      "     npm run hedera:topic -- submit --file .cache/hedera/topic-UUID.json",
      "     npm run hedera:topic -- status --file .cache/hedera/topic-UUID.json",
      "Solo testnet. Prepare firma y guarda; submit envía una única vez el archivo persistido.",
      "Requiere operador privado con clave DER y saldo ficticio; nunca compra HBAR.",
      "Submit debe ejecutarse antes del vencimiento de 120 segundos; no cambia el ID al vencer.",
      "Ante resultado incierto usar status. No borrar el marcador .submitted.json para reenviar.",
      "No modifica .env.local ni publica eventos operativos. --help no carga secretos ni conecta.",
    ].join("\n"));
    return;
  }
  const command = args[0];
  if (!(command === "prepare" && args.length === 1)
    && !((command === "submit" || command === "status") && args.length === 3 && args[1] === "--file")) {
    throw new HcsError("HCS_INVALID_PREPARATION");
  }
  loadCliEnvironment(ROOT);
  if (command === "prepare") {
    const { prepareTopic } = await import("../src/server/hedera/sdk");
    const prepared = await prepareTopic(process.env);
    await mkdir(DIRECTORY, { recursive: true });
    await requireDirectory();
    const path = resolve(DIRECTORY, `topic-${randomUUID()}.json`);
    await newPrivateFile(path, {
      version: 1, network: "testnet", kind: "CREATE_TOPIC", operatorId: prepared.operatorId,
      transactionId: prepared.transactionId, signedTransactionBytes: Buffer.from(prepared.signedBytes).toString("base64"),
      preparedAt: new Date().toISOString(),
    });
    console.log(JSON.stringify({ code: "TOPIC_PREPARED_NOT_SENT", file: relative(ROOT, path), transactionId: prepared.transactionId }));
    return;
  }
  const { path, journal, signedBytes } = await readJournal(args[2]);
  if (command === "status") { printStatus(journal.transactionId, await topicStatus(journal.transactionId)); return; }
  const { readPreparedTopic, sendFailure, transactionExpired, withTestnetClient } = await import("../src/server/hedera/sdk");
  const tx = readPreparedTopic(process.env, { ...journal, signedBytes });
  // Reconciling an existing ID is safe even when its transaction has expired.
  const known = await topicStatus(journal.transactionId);
  if (known.kind !== "unknown") { printStatus(journal.transactionId, known); return; }
  if (transactionExpired(tx)) throw new HcsError("HCS_TRANSACTION_EXPIRED");
  try {
    // Durable exclusive claim: a second invocation can only query status.
    await newPrivateFile(`${path}.submitted.json`, { transactionId: journal.transactionId, at: new Date().toISOString() });
  } catch (error) {
    if (error !== null && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      printStatus(journal.transactionId, known); return;
    }
    throw error;
  }
  try {
    await withTestnetClient((client) => tx.execute(client, 5000));
    console.log(JSON.stringify({ code: "TOPIC_SUBMITTED_UNCONFIRMED", transactionId: journal.transactionId, network: "testnet" }));
  } catch (error) { printStatus(journal.transactionId, sendFailure(error)); }
}

main().catch((error: unknown) => {
  console.error(error instanceof HcsError ? error.code : "HCS_ADMIN_OPERATION_FAILED");
  process.exitCode = 1;
});

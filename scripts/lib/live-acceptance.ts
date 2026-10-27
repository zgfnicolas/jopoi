import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { chromium } from "playwright";
import { Journey } from "../../tests/e2e/support/journey";
import type { PublicTraceResponse, TraceEvent } from "../../src/shared/trace-contracts";
import { evidenceRevision } from "./evidence";
import { liveJournal, realEvent } from "./acceptance-report";
import { ENVIRONMENT_VARIABLES } from "../../src/server/config/environment";

const types = ["LOT_PUBLISHED", "LOT_APPROVED", "TRANSPORT_ASSIGNED", "PICKUP_CONFIRMED", "RECEIPT_ACCEPTED"];
const mirror = "https://testnet.mirrornode.hedera.com/api/v1/";
const keys = ["appliedAt", "buyer", "code", "demo", "detail", "eventId", "humidityPercent", "id", "label", "material", "name", "network", "ordinal", "quantityKg", "reason", "receivedKg", "role", "scenarioVersion", "state", "traceId", "trip", "type", "version"];
async function json(url: string): Promise<unknown> {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } });
  if (!response.ok || !response.body) throw new Error("LIVE_READ_UNAVAILABLE");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 262144) { await reader.cancel(); throw new Error("LIVE_RESPONSE_TOO_LARGE"); }
      parts.push(part.value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts)),
    (key: string, value: unknown, context?: { source?: string }) => key === "sequence_number" && typeof value === "number" ? context?.source : value);
}

async function independentMirror(event: TraceEvent, topic: string, operator: string) {
  const p = event.publication;
  const match = /^(0\.0\.[1-9]\d*)@(\d{1,19})\.(\d{9})$/.exec(p.transactionId ?? "");
  if (!match || p.topicId !== topic || !/^\d+$/.test(p.sequenceNumber ?? "") || !event.event) throw new Error("LIVE_IDENTIFIERS_MISSING");
  if (match[1] !== operator) throw new Error("LIVE_OPERATOR_MISMATCH");
  const tid = `${match[1]}-${match[2]}-${match[3]}`;
  const transaction = z.object({ transactions: z.array(z.object({ transaction_id: z.string(), name: z.string(), result: z.string(),
    entity_id: z.string().nullable(), consensus_timestamp: z.string(), nonce: z.number(), scheduled: z.boolean() })).max(32) })
    .parse(await json(`${mirror}transactions/${tid}?nonce=0&scheduled=false`));
  if (transaction.transactions.filter(row => row.transaction_id === tid && row.name === "CONSENSUSSUBMITMESSAGE" && row.result === "SUCCESS"
    && row.entity_id === topic && row.consensus_timestamp === p.consensusTimestamp && row.nonce === 0 && !row.scheduled).length !== 1) throw new Error("LIVE_TRANSACTION_MISMATCH");
  const message = z.object({ topic_id: z.string(), sequence_number: z.string(), consensus_timestamp: z.string(), payer_account_id: z.string(), message: z.string().max(2048),
    chunk_info: z.object({ number: z.literal(1), total: z.literal(1), initial_transaction_id: z.string() }).nullable() })
    .parse(await json(`${mirror}topics/${topic}/messages/${p.sequenceNumber}`));
  if (message.topic_id !== topic || message.sequence_number !== p.sequenceNumber || message.consensus_timestamp !== p.consensusTimestamp
    || message.payer_account_id !== match[1] || message.chunk_info && message.chunk_info.initial_transaction_id !== tid) throw new Error("LIVE_MESSAGE_IDENTIFIERS_MISMATCH");
  let decoded: unknown;
  try { decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(message.message, "base64"))); }
  catch { throw new Error("LIVE_ENVELOPE_MISMATCH"); }
  const envelopeResult = z.strictObject({ version: z.literal(1), demo: z.literal(true), network: z.literal("testnet"), traceId: z.uuid(), eventId: z.uuid(),
    ordinal: z.number().int(), type: z.string(), role: z.string(), digest: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(decoded);
  if (!envelopeResult.success) throw new Error("LIVE_ENVELOPE_MISMATCH");
  const envelope = envelopeResult.data;
  // Independent fixed ordering for the v1 public payload's ASCII field names.
  const digest = createHash("sha256").update(JSON.stringify(event.event.payload, keys), "utf8").digest("hex");
  const payload = event.event.payload;
  if (envelope.traceId !== payload.traceId || envelope.eventId !== event.eventId || envelope.ordinal !== event.ordinal
    || envelope.type !== event.type || envelope.role !== event.role || digest !== event.event.digest || envelope.digest !== digest) throw new Error("LIVE_DIGEST_MISMATCH");
  return realEvent.parse({ eventId: event.eventId, ordinal: event.ordinal, type: event.type, transactionId: p.transactionId!, topicId: topic,
    sequenceNumber: p.sequenceNumber!, consensusTimestamp: p.consensusTimestamp!, digest, result: "APROBADO", mirrorVerified: true });
}

export async function runLive(origin: string, topic: string, operator: string, file: string) {
  const source = evidenceRevision();
  let journal: z.infer<typeof liveJournal>;
  let recoveryOnly = false;
  try {
    journal = liveJournal.parse(JSON.parse(await readFile(file, "utf8")));
    if (journal.candidateUrl !== origin || journal.revision !== source.revision || journal.fingerprint !== source.fingerprint) throw new Error("LIVE_JOURNAL_TARGET_CHANGED");
    recoveryOnly = true;
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    journal = { version: 1, mode: "REAL_TESTNET", revision: source.revision, fingerprint: source.fingerprint, candidateUrl: origin,
      startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: "BLOQUEADO", recovery: "Inicio registrado; todavía sin recorrido público.", traceId: null, events: [] };
    await writeFile(file, JSON.stringify(journal, null, 2), { flag: "wx", mode: 0o600 });
  }
  const save = async () => { journal.updatedAt = new Date().toISOString(); await writeFile(file, JSON.stringify(journal, null, 2), { mode: 0o600 }); };
  async function verify(ordinal: number) {
    if (!journal.traceId) throw new Error("LIVE_RECOVERY_TRACE_MISSING");
    let event: TraceEvent | undefined;
    for (let poll = 0; poll < 30; poll++) {
      const trace = await json(`${origin}/api/traces/${journal.traceId}`) as PublicTraceResponse;
      if (trace.traceId !== journal.traceId || trace.network !== "testnet" || !trace.demo || !Array.isArray(trace.events)) throw new Error("LIVE_TRACE_INVALID");
      event = trace.events.find(item => item.ordinal === ordinal);
      if (event && event.type !== types[ordinal - 1]) throw new Error("LIVE_EVENT_ORDER_MISMATCH");
      if (event?.publication.state === "CONFIRMED") break;
      if (event && ["UNCERTAIN", "FAILED", "PAUSED_CONFIG", "PAUSED_QUOTA"].includes(event.publication.state)) throw new Error("LIVE_PENDING_NO_RESEND");
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    if (!event || event.publication.state !== "CONFIRMED") throw new Error("LIVE_CONFIRMATION_PENDING");
    let evidence: Awaited<ReturnType<typeof independentMirror>> | undefined;
    for (let poll = 0; poll < 15; poll++) {
      try { evidence = await independentMirror(event, topic, operator); break; }
      catch (error) {
        if (error instanceof Error && /MISMATCH/.test(error.message)) throw error;
        if (poll === 14) throw new Error("LIVE_MIRROR_PENDING");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    journal.events = [...journal.events.filter(item => item.ordinal !== ordinal), evidence!].sort((a, b) => a.ordinal - b.ordinal);
    await save();
  }
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    if (recoveryOnly) {
      if (!journal.traceId) throw new Error("LIVE_RECOVERY_TRACE_MISSING");
      for (let ordinal = 1; ordinal <= 5; ordinal++) await verify(ordinal);
    } else {
      const browserEnvironment = { ...process.env };
      for (const name of ENVIRONMENT_VARIABLES) delete browserEnvironment[name];
      for (const name of Object.keys(browserEnvironment)) if (name.startsWith("JOPOI_")) delete browserEnvironment[name];
      browser = await chromium.launch({ env: browserEnvironment });
      const context = await browser.newContext({ locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" });
      const page = await context.newPage(); // No trace, storageState or HTTP-header logging.
      const flow = new Journey(page, origin);
      await flow.start();
      journal.traceId = z.uuid().parse(new URL(await flow.shareUrl()).pathname.split("/").at(-1));
      journal.recovery = "Continuar solo después de confirmar el hito conocido; nunca repetir automáticamente una escritura.";
      await save();
      const current = await context.request.get(`${origin}/api/demo/runs/${journal.traceId}`);
      const quota = z.object({ run: z.object({ quota: z.object({ remaining: z.number().int(), limit: z.number().int().max(100) }) }) }).parse(await current.json());
      if (quota.run.quota.remaining < 5) throw new Error("LIVE_QUOTA_INSUFFICIENT");
      await flow.publish(); await verify(1);
      await flow.role("coordinator"); await flow.action("Aprobar lote"); await verify(2);
      await flow.action(/^Asignar Retorno A/); await verify(3);
      await flow.role("carrier"); await flow.action("Confirmar retiro"); await verify(4);
      await flow.role("buyer"); await page.getByLabel("Peso recibido (kg)").fill("12000");
      await flow.action("Confirmar recepción conforme"); await verify(5);
      await page.goto(`${origin}/trazabilidad/${journal.traceId}`);
      await page.getByRole("heading", { name: "Historial y evidencia" }).waitFor();
      await page.screenshot({ path: file + ".png", fullPage: true });
    }
    journal.status = "APROBADO"; journal.recovery = null;
  } catch (error) {
    const code = error instanceof Error && /^LIVE_[A-Z_]+$/.test(error.message) ? error.message : "LIVE_DEPENDENCY_OR_BROWSER_FAILURE";
    journal.status = code.includes("MISMATCH") || code === "LIVE_TRACE_INVALID" ? "FALLIDO" : "BLOQUEADO";
    journal.recovery = code;
  } finally { await browser?.close(); await save(); }
  return journal;
}

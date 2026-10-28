import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { z } from "zod";
import { evidenceRevision } from "./evidence";

export const verdict = z.enum(["APROBADO", "FALLIDO", "BLOQUEADO"]);
export type Verdict = z.infer<typeof verdict>;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const proofSource = z.strictObject({ file: z.string().min(1), sha256: hash });
export const providerProof = z.strictObject({
  version: z.literal(2), observedAt: z.iso.datetime(), candidateUrl: z.url(), deploymentRevision: z.string().regex(/^[a-f0-9]{40}$/),
  reviewMethod: z.literal("vercel-dashboard"), reviewed: z.literal(true),
  vercel: z.strictObject({ projectId: z.string().regex(/^prj_[A-Za-z0-9]+$/), plan: z.literal("Hobby"), noPaymentMethod: z.literal(true), noAutomaticUpgrade: z.literal(true), source: proofSource }),
  database: z.strictObject({ provider: z.literal("neon"), plan: z.literal("Free"),
    projectId: z.string().regex(/^prj_[A-Za-z0-9]+$/), resourceId: z.string().min(1).max(256),
    integrationMode: z.literal("native"), provisioning: z.literal("vercel-marketplace"),
    environments: z.tuple([z.literal("production")]), noIndependentAccount: z.literal(true), credentialsSynced: z.literal(true),
    noPaymentMethod: z.literal(true), noAutomaticUpgrade: z.literal(true), source: proofSource }),
  cron: z.strictObject({ schedule: z.literal("0 3 * * *"), executedAt: z.iso.datetime(),
    result: z.enum(["MAINTENANCE_COMPLETE", "MAINTENANCE_SKIPPED"]), source: proofSource }),
}).refine(proof => proof.vercel.projectId === proof.database.projectId);

/** Project identity only; never read environment files or integration secrets. */
function linkedVercelProjectId(): string | undefined {
  try {
    return z.object({ projectId: z.string().regex(/^prj_[A-Za-z0-9]+$/) })
      .parse(JSON.parse(readFileSync(resolve(".vercel/project.json"), "utf8"))).projectId;
  } catch { return undefined; }
}

export function readProof(file: string | undefined, origin: string | undefined, revision: string, projectId = linkedVercelProjectId()) {
  if (!file || !origin || !projectId) return null;
  try {
    const proof = providerProof.parse(JSON.parse(readFileSync(file, "utf8")));
    if (proof.vercel.projectId !== projectId || proof.candidateUrl !== origin || proof.deploymentRevision !== revision || Date.parse(proof.observedAt) > Date.now()
      || Date.now() - Date.parse(proof.observedAt) > 7 * 86400000 || Date.parse(proof.cron.executedAt) > Date.now()
      || Date.now() - Date.parse(proof.cron.executedAt) > 7 * 86400000) return null;
    for (const source of [proof.vercel.source, proof.database.source, proof.cron.source]) {
      const artifact = resolve(source.file);
      if (!artifact.startsWith(resolve(".cache/acceptance") + sep)) return null;
      if (createHash("sha256").update(readFileSync(artifact)).digest("hex") !== source.sha256) return null;
    }
    return proof;
  } catch { return null; }
}

const localReport = z.object({ generatedAt: z.iso.datetime(), fingerprint: hash, cases: z.array(z.object({ id: z.string(), result: verdict,
  observations: z.array(z.object({ project: z.string(), status: z.string() })).optional() })) });
function results(file: string, fingerprint: string) {
  try {
    const report = localReport.parse(JSON.parse(readFileSync(file, "utf8")));
    if (report.fingerprint !== fingerprint || Date.parse(report.generatedAt) > Date.now() || Date.now() - Date.parse(report.generatedAt) > 7 * 86400000) return null;
    return report;
  } catch { return null; }
}
const eventTypes = ["LOT_PUBLISHED", "LOT_APPROVED", "TRANSPORT_ASSIGNED", "PICKUP_CONFIRMED", "RECEIPT_ACCEPTED"] as const;
export const realEvent = z.strictObject({ eventId: z.uuid(), ordinal: z.number().int().min(1).max(5), type: z.enum(eventTypes),
  transactionId: z.string().regex(/^0\.0\.[1-9]\d*@\d{1,19}\.\d{9}$/), topicId: z.string().regex(/^0\.0\.[1-9]\d*$/),
  sequenceNumber: z.string().regex(/^[1-9]\d*$/), consensusTimestamp: z.string().regex(/^\d{1,19}\.\d{9}$/), digest: hash,
  result: z.literal("APROBADO"), mirrorVerified: z.literal(true) });
export const liveJournal = z.strictObject({ version: z.literal(1), mode: z.literal("REAL_TESTNET"),
  revision: z.string(), fingerprint: hash, candidateUrl: z.url(), startedAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  status: verdict, recovery: z.string().nullable(), traceId: z.uuid().nullable(), events: z.array(realEvent).max(5) }).superRefine((journal, context) => {
    if (new Set(journal.events.map(event => event.eventId)).size !== journal.events.length
      || new Set(journal.events.map(event => event.transactionId)).size !== journal.events.length
      || journal.events.some((event, index) => event.ordinal !== index + 1 || event.type !== eventTypes[index])
      || journal.status === "APROBADO" && (journal.events.length !== 5 || journal.traceId === null)) {
      context.addIssue({ code: "custom", message: "FIVE_DISTINCT_ORDERED_EVENTS_REQUIRED" });
    }
  });

export function acceptanceReport(origin?: string, proofFile?: string, journalFile?: string, topic?: string, operator?: string) {
  const source = evidenceRevision();
  const api = results(".cache/api-tests/results/report.json", source.fingerprint);
  const browser = results(".cache/e2e/report.json", source.fingerprint);
  const proof = readProof(proofFile, origin, source.revision);
  let live: z.infer<typeof liveJournal> | null = null;
  if (journalFile && existsSync(journalFile)) {
    const parsed = liveJournal.safeParse(JSON.parse(readFileSync(journalFile, "utf8")));
    if (parsed.success && parsed.data.fingerprint === source.fingerprint && parsed.data.revision === source.revision
      && parsed.data.candidateUrl === origin && Date.parse(parsed.data.updatedAt) <= Date.now()
      && Date.now() - Date.parse(parsed.data.updatedAt) < 7 * 86400000
      && parsed.data.events.every(event => event.topicId === topic && event.transactionId.startsWith(`${operator}@`))) live = parsed.data;
  }
  const local = (id: string): Verdict => {
    const item = browser?.cases.find(item => item.id === id);
    if (!item || !["chromium-desktop", "webkit-mobile", "chromium-desktop-dark", "webkit-mobile-dark"].every(project => item.observations?.some(value => value.project === project))) return "BLOQUEADO";
    return item.result;
  };
  const real: Verdict = live?.status === "FALLIDO" ? "FALLIDO" : live?.status === "APROBADO" && live.events.length === 5 ? "APROBADO" : "BLOQUEADO";
  const cases = Array.from({ length: 15 }, (_, index) => {
    const id = `E2E-${String(index + 1).padStart(2, "0")}`;
    const result: Verdict = id === "E2E-12" ? real : id === "E2E-13" ? proof ? "APROBADO" : "BLOQUEADO"
      : id === "E2E-14" ? local(id) === "FALLIDO" ? "FALLIDO" : proof && local(id) === "APROBADO" ? "APROBADO" : "BLOQUEADO" : local(id);
    return { id, result, local: ["E2E-12", "E2E-13"].includes(id) ? "NO_APLICA" : local(id),
      recovery: result === "BLOQUEADO" ? id === "E2E-12" ? "Falta comprobar cinco hitos reales con el candidato y journal seleccionados."
        : ["E2E-13", "E2E-14"].includes(id) ? "Falta evidencia v2 del proyecto Vercel vinculado, base nativa gratuita y ejecución del cron diario del candidato."
        : "Falta evidencia vigente de las cuatro variantes de navegador y tema." : null };
  });
  const criterionCases = [["E2E-01", "E2E-10", "E2E-13"], ["E2E-03", "E2E-04", "E2E-05"], ["E2E-03", "E2E-04", "E2E-05"],
    ["E2E-06", "E2E-08"], ["E2E-08"], ["E2E-12"], ["E2E-09"], ["E2E-06", "E2E-11"], ["E2E-14"], ["E2E-07"],
    ["E2E-01", "E2E-15"], ["E2E-13"], ["E2E-12", "E2E-13", "E2E-14"], ["E2E-08", "E2E-12"]];
  const combine = (states: string[]): Verdict => states.includes("FALLIDO") ? "FALLIDO" : states.every(state => state === "APROBADO") ? "APROBADO" : "BLOQUEADO";
  const apiVerdict = api && api.cases.length === 26 ? combine(api.cases.map(item => item.result)) : "BLOQUEADO";
  const ui = combine([local("S20-01"), local("S20-02")]);
  const criteria = criterionCases.map((ids, index) => ({ criterion: index + 1, cases: ids,
    result: combine([apiVerdict, ...ids.map(id => cases.find(item => item.id === id)!.result)]) }));
  return { generatedAt: new Date().toISOString(), ...source, mode: "ACCEPTANCE_AGGREGATE", api: apiVerdict,
    ui,
    status: combine([apiVerdict, ui, source.dirty ? "BLOQUEADO" : "APROBADO", ...cases.map(item => item.result)]),
    note: "La evidencia local usa Hedera controlado y móvil emulado. Un estado bloqueado no acredita aceptación final.", cases, criteria };
}

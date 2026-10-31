import { now as wallNow } from "@/server/runtime/clock";
import "server-only";
import { bindBusinessTraceId } from "../diagnostics";
import { createHash } from "node:crypto";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { canonicalJson } from "../../domain/canonical-json";
import { PUBLICATION_RETRY_OUTCOMES, type PublicationRetryResponse } from "../../shared/event-contracts";
import { ApplicationError } from "../application-error";
import { withTransaction } from "../database";
import { apiBoundary, PRIVATE_RESPONSE_HEADERS, readJsonBody, requireBrowserMutation } from "../http";
import { SESSION_COOKIE, sessionTokenHash } from "../sessions/credentials";
import { requireOwnedRun } from "../sessions/service";
import { publicationSummary } from "./summary";
import { quotaSummary } from "./coordinator";
import { schedulePublications } from "./service";
import { readRunOperation, readRunSnapshot } from "../operations/storage";
import { readPublicEvent } from "../events/payload";

const uuid = z.uuid().transform(v => v.toLowerCase());
const resultSchema = z.strictObject({ version: z.literal(1), eventId: uuid,
  outcome: z.enum(PUBLICATION_RETRY_OUTCOMES) });

export async function retryPublicationHttp(request: NextRequest, context: { params: Promise<{ traceId: string; eventId: string }> }) {
  return apiBoundary("publications.retry", async () => {
    requireBrowserMutation(request);
    const params = z.strictObject({ traceId: uuid, eventId: uuid }).safeParse(await context.params);
    const body = z.strictObject({ requestId: uuid }).safeParse(await readJsonBody(request, 4096));
    if (!params.success || !body.success) throw new ApplicationError("INVALID_INPUT");
    const { traceId, eventId } = params.data;
    bindBusinessTraceId(traceId);
    const { requestId } = body.data;
    const hash = sessionTokenHash(request.cookies.get(SESSION_COOKIE)?.value);
    const intentHash = createHash("sha256").update(canonicalJson({ version: 1, action: "retryPublication", eventId })).digest("hex");
    async function resolve(allowWrite: boolean): Promise<PublicationRetryResponse> {
      return withTransaction(async tx => {
        const { run } = await requireOwnedRun(tx, hash, traceId);
        const snapshot = readRunSnapshot(run);
        readRunOperation(run, snapshot);
        let row = await tx.hcsPublication.findFirst({ where: { eventId, event: { runId: run.id } }, include: { event: true, attempts: { orderBy: { slot: "desc" }, take: 1 } } });
        if (!row) throw new ApplicationError("NOT_FOUND");
        readPublicEvent(row.event, traceId, snapshot);
        const key = { runId: run.id, requestId };
        const previous = await tx.commandReceipt.findUnique({ where: { runId_requestId: key } });
        const blockedBy = (await tx.operationEvent.findFirst({ where: { runId: run.id, ordinal: { lt: row.event.ordinal }, publication: { is: { state: { not: "CONFIRMED" } } } }, orderBy: { ordinal: "asc" }, select: { id: true } }))?.id ?? null;
        let result: z.infer<typeof resultSchema>;
        if (previous) {
          if (previous.intentHash !== intentHash || previous.action !== "RETRY_PUBLICATION") throw new ApplicationError("IDEMPOTENCY_CONFLICT");
          const parsed = resultSchema.safeParse(previous.result);
          if (!parsed.success || parsed.data.eventId !== eventId) throw new ApplicationError("INTERNAL_ERROR");
          result = parsed.data;
        } else {
          if (!allowWrite) throw new ApplicationError("VERSION_CONFLICT");
          const last = row.attempts[0];
          const uncertain = last && ["STARTED", "UNCERTAIN"].includes(last.state);
          const grant = row.state !== "CONFIRMED" && !blockedBy && !uncertain && last?.state === "REJECTED" && row.automaticAttempts >= 3 && row.manualAttempts === 0;
          const outcome = row.state === "CONFIRMED" ? "ALREADY_CONFIRMED" : blockedBy ? "BLOCKED" : uncertain ? "RECONCILE_ONLY"
            : grant || row.manualAuthorizedAt !== null && last?.state === "RESERVED" ? "MANUAL_AUTHORIZED" : row.manualAttempts > 0 ? "EXHAUSTED" : "AUTOMATIC_PENDING";
          result = { version: 1, eventId, outcome };
          if (grant && row.manualAuthorizedAt === null) row = { ...row, ...await tx.hcsPublication.update({ where: { eventId }, data: { manualAuthorizedAt: wallNow(), nextAttemptAt: wallNow() } }) };
          await tx.commandReceipt.create({ data: { ...key, intentHash, action: "RETRY_PUBLICATION", resultingVersion: run.version, result } });
        }
        const quota = await quotaSummary(tx, process.env, wallNow());
        return { saved: true, replayed: previous !== null, traceId, eventId, outcome: result.outcome,
          publication: publicationSummary(row, { blockedBy, quota }), quota };
      });
    }
    let result;
    try { result = await resolve(true); }
    catch (error) {
      if (!(error instanceof ApplicationError && error.code === "VERSION_CONFLICT") && !(error !== null && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
      result = await resolve(false);
    }
    schedulePublications(traceId);
    return NextResponse.json(result, { status: result.replayed ? 200 : 202, headers: PRIVATE_RESPONSE_HEADERS });
  });
}

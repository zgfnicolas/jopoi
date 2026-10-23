import "server-only";

import type { DemoRun, DemoSession, Prisma } from "../../generated/prisma/client";
import { evaluateTripCompatibility } from "../../domain/compatibility";
import { calculateEconomics } from "../../domain/economics";
import type { DemoRunDetail, DemoRunResponse } from "../../shared/run-contracts";
import { ApplicationError } from "../application-error";
import { withTransaction } from "../database";
import { readPublicEvent } from "../events/payload";
import { publicationSummary, publicationSummarySelect } from "../hedera/summary";
import { quotaSummary } from "../hedera/coordinator";
import { sessionTokenHash } from "../sessions/credentials";
import { requireOwnedRun, requireSession, sessionSummary } from "../sessions/service";
import { readRunOperation, readRunSnapshot } from "./storage";

async function runDetail(tx: Prisma.TransactionClient, run: DemoRun): Promise<DemoRunDetail> {
  const scenario = readRunSnapshot(run);
  const operation = readRunOperation(run);
  const compatibility = evaluateTripCompatibility(operation.quantityKg, scenario);
  const economics = calculateEconomics(operation.quantityKg, scenario.pricing);
  if (!compatibility.ok || !economics.ok) throw new ApplicationError("INTERNAL_ERROR");
  const rows = await tx.operationEvent.findMany({
    where: { runId: run.id }, orderBy: { ordinal: "asc" },
    include: { publication: { select: publicationSummarySelect } },
  });
  const quota = await quotaSummary(tx, process.env, new Date());
  const events = rows.map((row) => {
    if (row.publication === null) throw new ApplicationError("INTERNAL_ERROR");
    return {
      event: readPublicEvent(row, run.traceId),
      publication: publicationSummary(row.publication, { blockedBy: rows.find(previous => previous.ordinal < row.ordinal && previous.publication?.state !== "CONFIRMED")?.id ?? null, quota }),
    };
  });
  return {
    traceId: run.traceId, version: run.version, expiresAt: run.expiresAt.toISOString(),
    operation, scenario, compatibility: compatibility.value, economics: economics.value, events,
    quota,
  };
}

function requireReadValidity(session: DemoSession, run: DemoRun | null): void {
  const now = Date.now();
  if (session.expiresAt.getTime() <= now) throw new ApplicationError("SESSION_EXPIRED");
  if (run !== null && run.expiresAt.getTime() <= now) throw new ApplicationError("NOT_FOUND");
}

/** Lecturas coherentes y sin efectos: no inicia sesión, recorrido ni publicación. */
export async function getCurrentRun(token: string | undefined): Promise<DemoRunResponse> {
  const hash = sessionTokenHash(token);
  return withTransaction(async (tx) => {
    const session = await requireSession(tx, hash);
    const run = await tx.demoRun.findFirst({
      where: { sessionId: session.id, expiresAt: { gt: new Date() } }, orderBy: { ordinal: "desc" },
    });
    const detail = run === null ? null : await runDetail(tx, run);
    requireReadValidity(session, run);
    return { session: sessionSummary(session), run: detail };
  });
}

export async function getOwnedRun(token: string | undefined, traceId: string): Promise<DemoRunResponse> {
  const hash = sessionTokenHash(token);
  return withTransaction(async (tx) => {
    const { session, run } = await requireOwnedRun(tx, hash, traceId);
    const detail = await runDetail(tx, run);
    requireReadValidity(session, run);
    return { session: sessionSummary(session), run: detail };
  });
}

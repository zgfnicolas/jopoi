import "server-only";
import { commandBody } from "../../shared/request-contracts";
import { bindBusinessTraceId, logDiagnostic } from "../diagnostics";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { DemoCommandResponse } from "../../shared/run-contracts";
import { ApplicationError } from "../application-error";
import { apiBoundary, PRIVATE_RESPONSE_HEADERS, readJsonBody, requireBrowserMutation } from "../http";
import { requireSessionRateLimit } from "../security/rate-limit";
import { SESSION_COOKIE } from "../sessions/credentials";
import { executeOperationCommand } from "./commands";
import { schedulePublications } from "../hedera/service";
import { getCurrentRun, getOwnedRun } from "./queries";

const uuid = z.uuid().transform((value) => value.toLowerCase());

interface TraceContext {
  readonly params: Promise<{ traceId: string }>;
}

async function traceFrom(context: TraceContext): Promise<string> {
  const parsed = uuid.safeParse((await context.params).traceId);
  if (!parsed.success) throw new ApplicationError("INVALID_INPUT", { traceId: ["Ingresá un identificador UUID válido."] });
  bindBusinessTraceId(parsed.data);
  return parsed.data;
}

export async function getCurrentRunHttp(request: NextRequest): Promise<NextResponse> {
  return apiBoundary("runs.current", request, async () => {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    await requireSessionRateLimit(token, "PRIVATE_READ");
    return NextResponse.json(await getCurrentRun(token), { headers: PRIVATE_RESPONSE_HEADERS });
  });
}

export async function getOwnedRunHttp(request: NextRequest, context: TraceContext): Promise<NextResponse> {
  return apiBoundary("runs.read", request, async () => {
    const traceId = await traceFrom(context);
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    await requireSessionRateLimit(token, "PRIVATE_READ");
    return NextResponse.json(await getOwnedRun(token, traceId), { headers: PRIVATE_RESPONSE_HEADERS });
  });
}

export async function postCommandHttp(request: NextRequest, context: TraceContext): Promise<NextResponse> {
  return apiBoundary("runs.command", request, async () => {
    requireBrowserMutation(request);
    const traceId = await traceFrom(context);
    const parsed = commandBody.safeParse(await readJsonBody(request, 4096));
    if (!parsed.success) throw new ApplicationError("INVALID_INPUT", {
      form: ["Ingresá una acción, rol, UUID, versión y únicamente los campos permitidos con sus tipos correctos."],
    });
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    await requireSessionRateLimit(token, "MUTATION");
    const { requestId, expectedVersion, ...command } = parsed.data;
    const result = await executeOperationCommand({ token, traceId, requestId, expectedVersion, command });
    const body: DemoCommandResponse = {
      saved: true, traceId, replayed: result.replayed,
      applied: { operation: result.applied.operation, version: result.applied.version, eventId: result.applied.eventId },
      current: { operation: result.current.operation, version: result.current.version },
      event: result.event, publication: result.publication,
    };
    logDiagnostic({ event: "operation.committed", outcome: "success", code: "OPERATION_COMMITTED", durationMs: 0 });
    if (result.event !== null) schedulePublications(traceId);
    return NextResponse.json(body, { headers: PRIVATE_RESPONSE_HEADERS });
  });
}

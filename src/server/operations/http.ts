import "server-only";
import { commandBody, operationPatchBody } from "../../shared/request-contracts";
import { bindBusinessTraceId, logDiagnostic } from "../diagnostics";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { DemoCommandResponse, OperationPatchResponse, OperationResource } from "../../shared/run-contracts";
import { ApplicationError } from "../application-error";
import { apiBoundary, PRIVATE_RESPONSE_HEADERS, readJsonBody, requireBrowserMutation } from "../http";
import { requireSessionRateLimit } from "../security/rate-limit";
import { extractSessionCredentials } from "../sessions/credentials";
import { executeOperationCommand, patchOperationCommand } from "./commands";
import { schedulePublications } from "../hedera/service";
import { getCurrentRun, getOperationResource, getOwnedRun } from "./queries";
import { computeOperationEtag, computeRunEtag, matchesIfNoneMatch } from "./etag";

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
    const creds = extractSessionCredentials(request);
    if (creds.ambiguous) throw new ApplicationError("SESSION_REQUIRED");
    const token = creds.token;
    await requireSessionRateLimit(token, "PRIVATE_READ");
    return NextResponse.json(await getCurrentRun(token), { headers: PRIVATE_RESPONSE_HEADERS });
  });
}

export async function getOwnedRunHttp(request: NextRequest, context: TraceContext): Promise<NextResponse> {
  return apiBoundary("runs.read", request, async () => {
    const traceId = await traceFrom(context);
    const creds = extractSessionCredentials(request);
    if (creds.ambiguous) throw new ApplicationError("SESSION_REQUIRED");
    const token = creds.token;
    await requireSessionRateLimit(token, "PRIVATE_READ");
    const runResponse = await getOwnedRun(token, traceId);
    const etag = computeRunEtag(runResponse);
    const ifNoneMatch = request.headers.get("if-none-match");
    if (matchesIfNoneMatch(ifNoneMatch, etag)) {
      return new NextResponse(null, { status: 304, headers: { ...PRIVATE_RESPONSE_HEADERS, ETag: etag } });
    }
    return NextResponse.json(runResponse, { headers: { ...PRIVATE_RESPONSE_HEADERS, ETag: etag } });
  });
}

/**
 * Consulta de la representación operativa pura (GET /api/demo/runs/:traceId/operation).
 * ETag fuerte y validación condicional con If-None-Match.
 */
export async function getOperationHttp(request: NextRequest, context: TraceContext): Promise<NextResponse> {
  return apiBoundary("runs.operation.read", request, async () => {
    const traceId = await traceFrom(context);
    const creds = extractSessionCredentials(request);
    if (creds.ambiguous) throw new ApplicationError("SESSION_REQUIRED");
    const token = creds.token;
    await requireSessionRateLimit(token, "PRIVATE_READ");
    const resource: OperationResource = await getOperationResource(token, traceId);
    const etag = computeOperationEtag(resource);
    const ifNoneMatch = request.headers.get("if-none-match");
    if (matchesIfNoneMatch(ifNoneMatch, etag)) {
      return new NextResponse(null, { status: 304, headers: { ...PRIVATE_RESPONSE_HEADERS, ETag: etag } });
    }
    return NextResponse.json(resource, { headers: { ...PRIVATE_RESPONSE_HEADERS, ETag: etag } });
  });
}

/**
 * Edición de la operación con precondición fuerte If-Match y clave idempotente Idempotency-Key.
 * PATCH /api/demo/runs/:traceId/operation
 */
export async function patchOperationHttp(request: NextRequest, context: TraceContext): Promise<NextResponse> {
  return apiBoundary("runs.operation.patch", request, async () => {
    requireBrowserMutation(request);
    const traceId = await traceFrom(context);
    const rawBody = await readJsonBody(request, 4096);
    const parsed = operationPatchBody.safeParse(rawBody);
    if (!parsed.success) {
      throw new ApplicationError("INVALID_INPUT", {
        form: ["Ingresá una acción, rol y únicamente los campos permitidos con sus tipos correctos."],
      });
    }

    const idempotencyHeader = request.headers.get("idempotency-key");
    const bodyRequestId = parsed.data.requestId;
    if (idempotencyHeader !== null && bodyRequestId !== undefined) {
      if (idempotencyHeader.trim().toLowerCase() !== bodyRequestId.trim().toLowerCase()) {
        throw new ApplicationError("INVALID_INPUT", {
          requestId: ["La clave Idempotency-Key del encabezado debe coincidir con el requestId del cuerpo."],
        });
      }
    }
    const effectiveKey = idempotencyHeader?.trim() ?? bodyRequestId;
    if (!effectiveKey) {
      throw new ApplicationError("INVALID_INPUT", {
        idempotencyKey: ["Ingresá un encabezado Idempotency-Key con formato UUID válido."],
      });
    }
    const keyParsed = uuid.safeParse(effectiveKey);
    if (!keyParsed.success) {
      throw new ApplicationError("INVALID_INPUT", {
        idempotencyKey: ["Ingresá una clave Idempotency-Key UUID válida."],
      });
    }
    const idempotencyKey = keyParsed.data;

    const creds = extractSessionCredentials(request);
    if (creds.ambiguous) throw new ApplicationError("SESSION_REQUIRED");
    const token = creds.token;
    await requireSessionRateLimit(token, "MUTATION");

    const ifMatch = request.headers.get("if-match") ?? undefined;
    const { requestId: _req, expectedVersion, ...command } = parsed.data;

    const result = await patchOperationCommand({
      token,
      traceId,
      idempotencyKey,
      ifMatch,
      command,
      expectedVersion,
    });

    const body: OperationPatchResponse = {
      traceId,
      version: result.version,
      operation: result.operation,
      replayed: result.replayed,
      applied: result.applied,
      current: result.current,
    };

    logDiagnostic({ event: "operation.committed", outcome: "success", code: "OPERATION_COMMITTED", durationMs: 0 });
    if (result.event !== null) schedulePublications(traceId);
    return NextResponse.json(body, { headers: { ...PRIVATE_RESPONSE_HEADERS, ETag: result.etag } });
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

    const idempotencyHeader = request.headers.get("idempotency-key");
    if (idempotencyHeader !== null) {
      const headerParsed = uuid.safeParse(idempotencyHeader.trim());
      if (!headerParsed.success) {
        throw new ApplicationError("INVALID_INPUT", {
          idempotencyKey: ["Ingresá una clave Idempotency-Key UUID válida."],
        });
      }
      if (parsed.data.requestId.trim().toLowerCase() !== headerParsed.data) {
        throw new ApplicationError("INVALID_INPUT", {
          requestId: ["La clave Idempotency-Key del encabezado debe coincidir con el requestId del cuerpo."],
        });
      }
    }

    const creds = extractSessionCredentials(request);
    if (creds.ambiguous) throw new ApplicationError("SESSION_REQUIRED");
    const token = creds.token;
    await requireSessionRateLimit(token, "MUTATION");
    const { requestId, expectedVersion, ...command } = parsed.data;
    const result = await executeOperationCommand({ token, traceId, requestId, expectedVersion, command });
    const body: DemoCommandResponse = {
      saved: true, traceId, replayed: result.replayed,
      applied: { operation: result.applied.operation, version: result.applied.version, eventId: result.applied.eventId },
      current: { operation: result.current.operation, version: result.current.version },
      event: result.event, publication: result.publication,
    };
    const etag = computeOperationEtag({ traceId, version: result.current.version, operation: result.current.operation });
    logDiagnostic({ event: "operation.committed", outcome: "success", code: "OPERATION_COMMITTED", durationMs: 0 });
    if (result.event !== null) schedulePublications(traceId);
    return NextResponse.json(body, { headers: { ...PRIVATE_RESPONSE_HEADERS, ETag: etag } });
  });
}

import "server-only";

import { NextResponse } from "next/server";
import { createRequestContext, toApiError } from "./api-errors";
import { ApplicationError } from "./application-error";
import { getServerConfig, requireConfiguration } from "./config";
import { RateLimitError } from "./security/rate-limit";
import { performance } from "node:perf_hooks";
import { withRequestContext, logDiagnostic, shouldLogHttp, type HttpOperation } from "./diagnostics";

export const PRIVATE_RESPONSE_HEADERS = Object.freeze({ "Cache-Control": "private, no-store", Vary: "Cookie" });

/** Origen configurado, nunca Host o X-Forwarded-Host aportados por el visitante. */
export function requireBrowserMutation(request: Request): void {
  const { url } = requireConfiguration(getServerConfig().origin());
  if (request.headers.get("origin") !== url || request.headers.get("x-jopoi-request") !== "demo") {
    throw new ApplicationError("REQUEST_FORBIDDEN");
  }
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new ApplicationError("INVALID_INPUT");
  }
}

/** Acota el stream incluso si Content-Length falta o no describe su tamaño real. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    throw new ApplicationError("INVALID_INPUT");
  }
  if (request.body === null) throw new ApplicationError("INVALID_INPUT");
  const reader = request.body.getReader();
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApplicationError("INVALID_INPUT");
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApplicationError("INVALID_INPUT");
  } finally {
    reader.releaseLock();
  }
}

export async function apiBoundary(operation: HttpOperation, work: () => Promise<NextResponse>): Promise<NextResponse> {
  const context = createRequestContext(operation), started = performance.now();
  return withRequestContext(context, async () => {
  try {
    const response = await work();
    response.headers.set("X-Request-Id", context.requestId);
    logDiagnostic({ event: "http.completed", outcome: "success", code: "OK", status: response.status, durationMs: performance.now() - started });
    return response;
  } catch (error) {
    const result = toApiError(error, context);
    // Los rechazos normales se muestrean 1/16 con identidad interna; un fallo 5xx siempre se intenta exportar.
    if (shouldLogHttp(result.status, context.requestId)) logDiagnostic({ event: "http.completed", outcome: result.status >= 500 ? "error" : "rejected",
      code: result.body.error.code, severity: result.status >= 500 ? "ERROR" : result.status === 429 ? "WARN" : "INFO", status: result.status,
      durationMs: performance.now() - started, ...(result.status >= 500 ? { error } : {}) });
    return NextResponse.json(result.body, { status: result.status, headers: {
      ...PRIVATE_RESPONSE_HEADERS,
      "X-Request-Id": context.requestId,
      ...(error instanceof RateLimitError ? { "Retry-After": String(error.retryAfter) } : {}),
    } });
  }
  });
}

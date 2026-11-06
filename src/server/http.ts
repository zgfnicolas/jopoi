import "server-only";

import { performance } from "node:perf_hooks";
import { NextResponse } from "next/server";
import { getDeadlinePolicy } from "@/server/runtime/deadlines";
import { acceptsProblemDetails, PROBLEM_MEDIA_TYPE } from "../shared/problem-details";
import { createRequestContext, toApiError, toProblemDetails } from "./api-errors";
import { ApplicationError } from "./application-error";
import { getServerConfig, requireConfiguration } from "./config";
import { isReadOperation, operationBudgetMs } from "./deadlines";
import { currentRequestContext, logDiagnostic, shouldLogHttp, withRequestContext, type HttpOperation } from "./diagnostics";
import { RateLimitError } from "./security/rate-limit";
import { csrfToken, csrfTokenMatches, extractSessionCredentials } from "./sessions/credentials";

export const PRIVATE_RESPONSE_HEADERS = Object.freeze({ "Cache-Control": "private, no-store", Vary: "Cookie, Accept" });

/** Origen configurado, nunca Host o X-Forwarded-Host aportados por el visitante. */
export function requireBrowserMutation(request: Request): void {
  const { url } = requireConfiguration(getServerConfig().origin());
  if (request.headers.get("origin") !== url || request.headers.get("x-jopoi-request") !== "demo") {
    throw new ApplicationError("REQUEST_FORBIDDEN");
  }
  const contentType = request.headers.get("content-type");
  if (request.method !== "DELETE" || contentType !== null) {
    if (contentType?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
      throw new ApplicationError("INVALID_INPUT");
    }
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApplicationError("REQUEST_FORBIDDEN");
  }
  if (request.headers.get("sec-fetch-mode") === "navigate") {
    throw new ApplicationError("REQUEST_FORBIDDEN");
  }
  const creds = extractSessionCredentials(request);
  if (creds.ambiguous) {
    throw new ApplicationError("SESSION_REQUIRED");
  }
  if (creds.token !== undefined) {
    const provided = request.headers.get("x-csrf-token") ?? undefined;
    const expected = csrfToken(creds.token);
    if (!csrfTokenMatches(provided, expected)) {
      throw new ApplicationError("REQUEST_FORBIDDEN");
    }
  }
}

/** Acota el stream por bytes, tiempo y cancelación incluso sin Content-Length fiable. */
export async function readJsonBody(request: Request, maxBytes: number, timeoutOverrideMs?: number): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    await request.body?.cancel().catch(() => {});
    throw new ApplicationError("INVALID_INPUT");
  }
  if (request.body === null || request.signal.aborted) {
    await request.body?.cancel().catch(() => {});
    throw new ApplicationError("INVALID_INPUT");
  }
  const policy = getDeadlinePolicy();
  const context = currentRequestContext();
  const remaining = context ? Math.floor(context.deadlineAt - performance.now()) : policy.bodyReadTimeoutMs;
  const budgetMs = Math.min(timeoutOverrideMs ?? policy.bodyReadTimeoutMs, remaining);
  if (budgetMs <= 0) {
    await request.body.cancel().catch(() => {});
    throw new ApplicationError("INVALID_INPUT");
  }
  const reader = request.body.getReader();
  let aborted = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    const fail = () => {
      aborted = true;
      void reader.cancel().catch(() => {});
      reject(new ApplicationError("INVALID_INPUT"));
    };
    onAbort = fail;
    if (request.signal.aborted) {
      fail();
      return;
    }
    request.signal.addEventListener("abort", fail, { once: true });
    timer = setTimeout(fail, budgetMs);
  });
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await Promise.race([reader.read(), abortPromise]);
      if (aborted) throw new ApplicationError("INVALID_INPUT");
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new ApplicationError("INVALID_INPUT");
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    await reader.cancel().catch(() => {});
    throw new ApplicationError("INVALID_INPUT");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (onAbort !== undefined) request.signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

export async function apiBoundary(operation: HttpOperation, request: Request, work: () => Promise<NextResponse>): Promise<NextResponse> {
  const policy = getDeadlinePolicy();
  const budgetMs = operationBudgetMs(operation, policy);
  const context = createRequestContext(operation, {
    budgetMs,
    ...(isReadOperation(operation) ? { clientSignal: request.signal } : {}),
  });
  return withRequestContext(context, async () => {
    try {
      const response = await work();
      response.headers.set("X-Request-Id", context.requestId);
      logDiagnostic({ event: "http.completed", outcome: "success", code: "OK", status: response.status, durationMs: performance.now() - context.startedAt });
      return response;
    } catch (error) {
      const result = toApiError(error, context);
      if (shouldLogHttp(result.status, context.requestId)) {
        logDiagnostic({
          event: "http.completed",
          outcome: result.status >= 500 ? "error" : "rejected",
          code: result.body.error.code,
          severity: result.status >= 500 ? "ERROR" : result.status === 429 ? "WARN" : "INFO",
          status: result.status,
          durationMs: performance.now() - context.startedAt,
          ...(result.status >= 500 ? { error } : {}),
        });
      }
      const problem = acceptsProblemDetails(request.headers.get("accept"));
      const retryAfter = error instanceof RateLimitError ? error.retryAfter : error instanceof ApplicationError ? error.retryAfterSeconds : undefined;
      return NextResponse.json(problem ? toProblemDetails(result.body, context) : result.body, {
        status: result.status,
        headers: {
          ...PRIVATE_RESPONSE_HEADERS,
          ...(problem ? { "Content-Type": PROBLEM_MEDIA_TYPE } : {}),
          "X-Request-Id": context.requestId,
          ...((result.status === 429 || result.status === 503) && retryAfter !== undefined ? { "Retry-After": String(retryAfter) } : {}),
        },
      });
    }
  });
}

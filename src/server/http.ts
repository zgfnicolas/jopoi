import "server-only";

import { NextResponse } from "next/server";
import { createRequestContext, toApiError } from "./api-errors";
import { ApplicationError } from "./application-error";
import { getServerConfig, requireConfiguration } from "./config";
import { RateLimitError } from "./security/rate-limit";

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

export async function apiBoundary(work: () => Promise<NextResponse>): Promise<NextResponse> {
  const context = createRequestContext();
  try {
    return await work();
  } catch (error) {
    const result = toApiError(error, context);
    return NextResponse.json(result.body, { status: result.status, headers: {
      ...PRIVATE_RESPONSE_HEADERS,
      ...(error instanceof RateLimitError ? { "Retry-After": String(error.retryAfter) } : {}),
    } });
  }
}

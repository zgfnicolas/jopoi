import { z } from "zod";
import { type ApiErrorCode } from "@/shared/api-errors";
import { API_ACCEPT, apiMediaType, parseApiFailure } from "@/shared/problem-details";
import { retryAfterSeconds } from "./retry-after";
import { setCsrfToken } from "./csrf";

export interface ReadError { readonly code: ApiErrorCode | "NETWORK_UNAVAILABLE" | "INVALID_RESPONSE"; readonly requestId?: string; readonly retryAfter?: number }
export type ReadResult<T> = { ok: true; data: T; etag?: string | null } | { ok: false; error: ReadError };

/** Read-only same-origin transport. There is deliberately no mutation/retry capability. */
export async function readApi<T>(path: string, schema: z.ZodType<T>, signal: AbortSignal, credentials: "same-origin" | "omit" = "same-origin"): Promise<ReadResult<T>> {
  if (!path.startsWith("/api/") || path.includes("\\") || path.includes("#")) return { ok: false, error: { code: "INVALID_RESPONSE" } };
  try {
    const response = await fetch(path, { method: "GET", credentials, cache: "no-store", redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), headers: { Accept: API_ACCEPT } });
    const csrf = response.headers.get("x-csrf-token");
    if (csrf) setCsrfToken(csrf);
    if (!["application/json", "application/problem+json"].includes(apiMediaType(response.headers))) return { ok: false, error: { code: "INVALID_RESPONSE" } };
    const body: unknown = await response.json();
    if (!response.ok) {
      const parsed = parseApiFailure(body, response.status, apiMediaType(response.headers));
      const code = parsed?.code ?? "INVALID_RESPONSE";
      const retryAfter = retryAfterSeconds(response);
      const requestId = parsed?.requestId;
      return { ok: false, error: { code, ...(retryAfter === undefined ? {} : { retryAfter }), ...(requestId === undefined ? {} : { requestId }) } };
    }
    if (apiMediaType(response.headers) !== "application/json") return { ok: false, error: { code: "INVALID_RESPONSE" } };
    const parsed = schema.safeParse(body);
    return parsed.success ? { ok: true, data: parsed.data, etag: response.headers.get("etag") } : { ok: false, error: { code: "INVALID_RESPONSE" } };
  } catch { return { ok: false, error: { code: "NETWORK_UNAVAILABLE" } }; }
}

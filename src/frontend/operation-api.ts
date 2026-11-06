import { z } from "zod";
import { type ApiErrorCode } from "@/shared/api-errors";
import { API_ACCEPT, apiMediaType, parseApiFailure } from "@/shared/problem-details";
import { retryAfterSeconds } from "./retry-after";
import { getCsrfToken, setCsrfToken } from "./csrf";

export interface MutationError { code: ApiErrorCode | "NETWORK_UNAVAILABLE" | "INVALID_RESPONSE"; status: number | null; fields: Record<string, readonly string[]>; requestId?: string; retryAfter?: number }
export type MutationResult<T> = { ok: true; data: T } | { ok: false; error: MutationError };

/** Only private demo paths, a single POST, and bytes captured by the controller. */
export async function postOperation<T>(path: string, body: string, schema: z.ZodType<T>, statuses: readonly number[], signal: AbortSignal, csrfTokenOverride?: string): Promise<MutationResult<T>> {
  const fail = (code: MutationError["code"], status: number | null = null): MutationResult<T> => ({ ok: false, error: { code, status, fields: {} } });
  if (!/^\/api\/demo\/(?:session|runs(?:\/reset|\/[a-f0-9-]{36}\/(?:commands|events\/[a-f0-9-]{36}\/retry))?)$/.test(path)
    || new TextEncoder().encode(body).byteLength > 4096) return fail("INVALID_INPUT", 400);
  try {
    const csrf = csrfTokenOverride ?? getCsrfToken() ?? "";
    const response = await fetch(path, { method: "POST", body, credentials: "same-origin", cache: "no-store", redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      headers: { "Content-Type": "application/json", "X-Jopoi-Request": "demo", Accept: API_ACCEPT, "X-CSRF-Token": csrf } });
    const responseCsrf = response.headers.get("x-csrf-token");
    if (responseCsrf) setCsrfToken(responseCsrf);
    if (!["application/json", "application/problem+json"].includes(apiMediaType(response.headers))) return fail("INVALID_RESPONSE", response.status);
    const value: unknown = await response.json();
    if (statuses.includes(response.status) && apiMediaType(response.headers) === "application/json") {
      const parsed = schema.safeParse(value);
      return parsed.success ? { ok: true, data: parsed.data } : fail("INVALID_RESPONSE", response.status);
    }
    const parsed = parseApiFailure(value, response.status, apiMediaType(response.headers));
    if (!parsed) return fail("INVALID_RESPONSE", response.status);
    const code = parsed.code;
    const fields = parsed.fields;
    const retryAfter = retryAfterSeconds(response);
    return { ok: false, error: { code, status: response.status, fields, ...(parsed.requestId === undefined ? {} : { requestId: parsed.requestId }), ...(retryAfter === undefined ? {} : { retryAfter }) } };
  } catch { return fail("NETWORK_UNAVAILABLE"); }
}

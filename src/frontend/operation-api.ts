import { z } from "zod";
import { type ApiErrorCode } from "@/shared/api-errors";
import { API_ACCEPT, apiMediaType, parseApiFailure } from "@/shared/problem-details";
import { retryAfterSeconds } from "./retry-after";
import { clearCsrfToken, getCsrfToken, setCsrfToken } from "./csrf";

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

export async function deleteOperation(
  path: string,
  signal: AbortSignal,
  csrfTokenOverride?: string,
): Promise<{ ok: true } | { ok: false; error: MutationError }> {
  const fail = (code: MutationError["code"], status: number | null = null): { ok: false; error: MutationError } => ({ ok: false, error: { code, status, fields: {} } });
  if (path !== "/api/demo/session") return fail("INVALID_INPUT", 400);
  try {
    const csrf = csrfTokenOverride ?? getCsrfToken() ?? "";
    const response = await fetch(path, {
      method: "DELETE",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      headers: { "X-Jopoi-Request": "demo", Accept: API_ACCEPT, "X-CSRF-Token": csrf },
    });
    if (response.status === 204) {
      clearCsrfToken();
      return { ok: true };
    }
    const media = apiMediaType(response.headers);
    if (!["application/json", "application/problem+json"].includes(media)) return fail("INVALID_RESPONSE", response.status);
    const value: unknown = await response.json();
    const parsed = parseApiFailure(value, response.status, media);
    if (!parsed) return fail("INVALID_RESPONSE", response.status);
    if (response.status === 401 && ["SESSION_REQUIRED", "SESSION_EXPIRED"].includes(parsed.code)) {
      clearCsrfToken();
    }
    const retryAfter = retryAfterSeconds(response);
    return { ok: false, error: { code: parsed.code, status: response.status, fields: parsed.fields, ...(parsed.requestId === undefined ? {} : { requestId: parsed.requestId }), ...(retryAfter === undefined ? {} : { retryAfter }) } };
  } catch {
    return fail("NETWORK_UNAVAILABLE");
  }
}

export interface PatchResult<T> {
  readonly ok: true;
  readonly data: T;
  readonly etag: string | null;
}

export type OperationPatchApiResult<T> = PatchResult<T> | { readonly ok: false; readonly error: MutationError };

/**
 * Edición condicional e idempotente de la operación (PATCH /api/demo/runs/:traceId/operation).
 * Exige If-Match y vincula Idempotency-Key.
 */
export async function patchOperation<T>(
  path: string,
  body: string,
  schema: z.ZodType<T>,
  options: {
    readonly ifMatch?: string | undefined;
    readonly idempotencyKey: string;
    readonly signal: AbortSignal;
    readonly csrfTokenOverride?: string | undefined;
  },
): Promise<OperationPatchApiResult<T>> {
  const fail = (code: MutationError["code"], status: number | null = null): { ok: false; error: MutationError } => ({
    ok: false,
    error: { code, status, fields: {} },
  });
  if (!/^\/api\/demo\/runs\/[a-f0-9-]{36}\/operation$/.test(path) || new TextEncoder().encode(body).byteLength > 4096) {
    return fail("INVALID_INPUT", 400);
  }
  try {
    const csrf = options.csrfTokenOverride ?? getCsrfToken() ?? "";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Jopoi-Request": "demo",
      Accept: API_ACCEPT,
      "X-CSRF-Token": csrf,
      "Idempotency-Key": options.idempotencyKey,
    };
    if (options.ifMatch) {
      headers["If-Match"] = options.ifMatch;
    }
    const response = await fetch(path, {
      method: "PATCH",
      body,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([options.signal, AbortSignal.timeout(15000)]),
      headers,
    });
    const responseCsrf = response.headers.get("x-csrf-token");
    if (responseCsrf) setCsrfToken(responseCsrf);
    const media = apiMediaType(response.headers);
    if (!["application/json", "application/problem+json"].includes(media)) {
      return fail("INVALID_RESPONSE", response.status);
    }
    const value: unknown = await response.json();
    if (response.status === 200 && media === "application/json") {
      const parsed = schema.safeParse(value);
      return parsed.success
        ? { ok: true, data: parsed.data, etag: response.headers.get("etag") }
        : fail("INVALID_RESPONSE", response.status);
    }
    const parsed = parseApiFailure(value, response.status, media);
    if (!parsed) return fail("INVALID_RESPONSE", response.status);
    if (response.status === 401 && ["SESSION_REQUIRED", "SESSION_EXPIRED"].includes(parsed.code)) {
      clearCsrfToken();
    }
    const retryAfter = retryAfterSeconds(response);
    return {
      ok: false,
      error: {
        code: parsed.code,
        status: response.status,
        fields: parsed.fields,
        ...(parsed.requestId === undefined ? {} : { requestId: parsed.requestId }),
        ...(retryAfter === undefined ? {} : { retryAfter }),
      },
    };
  } catch {
    return fail("NETWORK_UNAVAILABLE");
  }
}

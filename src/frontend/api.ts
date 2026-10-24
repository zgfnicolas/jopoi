import { z } from "zod";
import { API_ERROR_CATALOG, type ApiErrorCode } from "@/shared/api-errors";

export interface ReadError { readonly code: ApiErrorCode | "NETWORK_UNAVAILABLE" | "INVALID_RESPONSE"; readonly requestId?: string }
export type ReadResult<T> = { ok: true; data: T } | { ok: false; error: ReadError };
const errorSchema = z.object({ error: z.object({ code: z.string(), requestId: z.uuid().optional() }) });

/** Read-only same-origin transport. There is deliberately no mutation/retry capability. */
export async function readApi<T>(path: string, schema: z.ZodType<T>, signal: AbortSignal): Promise<ReadResult<T>> {
  if (!path.startsWith("/api/") || path.includes("\\") || path.includes("#")) return { ok: false, error: { code: "INVALID_RESPONSE" } };
  try {
    const response = await fetch(path, { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), headers: { Accept: "application/json" } });
    if (!response.headers.get("content-type")?.includes("application/json")) return { ok: false, error: { code: "INVALID_RESPONSE" } };
    const body: unknown = await response.json();
    if (!response.ok) {
      const parsed = errorSchema.safeParse(body);
      const code = parsed.success ? Object.keys(API_ERROR_CATALOG).find(key => key === parsed.data.error.code) as ApiErrorCode | undefined : undefined;
      return { ok: false, error: { code: code ?? "INVALID_RESPONSE", ...(parsed.success ? { requestId: parsed.data.error.requestId } : {}) } };
    }
    const parsed = schema.safeParse(body);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: { code: "INVALID_RESPONSE" } };
  } catch { return { ok: false, error: { code: "NETWORK_UNAVAILABLE" } }; }
}

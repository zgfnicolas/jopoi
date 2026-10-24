import { z } from "zod";
import { API_ERROR_CATALOG, type ApiErrorCode } from "@/shared/api-errors";

export interface MutationError { code: ApiErrorCode | "NETWORK_UNAVAILABLE" | "INVALID_RESPONSE"; status: number | null; fields: Record<string, readonly string[]>; requestId?: string }
export type MutationResult<T> = { ok: true; data: T } | { ok: false; error: MutationError };
const messages = z.array(z.string().max(400)).max(8).optional();
const errorSchema = z.object({ error: z.object({ code: z.string(), requestId: z.uuid(), fields: z.object({
  quantityKg: messages, humidityPercent: messages, receivedKg: messages, reasonCode: messages, tripId: messages,
  role: messages, state: messages, form: messages, requestId: messages, expectedVersion: messages,
}).optional() }) });

/** Only private demo paths, a single POST, and bytes captured by the controller. */
export async function postOperation<T>(path: string, body: string, schema: z.ZodType<T>, statuses: readonly number[], signal: AbortSignal): Promise<MutationResult<T>> {
  const fail = (code: MutationError["code"], status: number | null = null): MutationResult<T> => ({ ok: false, error: { code, status, fields: {} } });
  if (!/^\/api\/demo\/(?:session|runs(?:\/reset|\/[a-f0-9-]{36}\/(?:commands|events\/[a-f0-9-]{36}\/retry))?)$/.test(path)
    || new TextEncoder().encode(body).byteLength > 4096) return fail("INVALID_INPUT", 400);
  try {
    const response = await fetch(path, { method: "POST", body, credentials: "same-origin", cache: "no-store", redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), headers: { "Content-Type": "application/json", "X-Jopoi-Request": "demo", Accept: "application/json" } });
    if (!response.headers.get("content-type")?.includes("application/json")) return fail("INVALID_RESPONSE", response.status);
    const value: unknown = await response.json();
    if (statuses.includes(response.status)) {
      const parsed = schema.safeParse(value);
      return parsed.success ? { ok: true, data: parsed.data } : fail("INVALID_RESPONSE", response.status);
    }
    const parsed = errorSchema.safeParse(value);
    if (!parsed.success) return fail("INVALID_RESPONSE", response.status);
    const code = Object.keys(API_ERROR_CATALOG).find(key => key === parsed.data.error.code) as ApiErrorCode | undefined;
    if (!code || API_ERROR_CATALOG[code].status !== response.status) return fail("INVALID_RESPONSE", response.status);
    const fields: Record<string, readonly string[]> = {};
    for (const [key, value] of Object.entries(parsed.data.error.fields ?? {})) if (value) fields[key] = value;
    return { ok: false, error: { code, status: response.status, fields, requestId: parsed.data.error.requestId } };
  } catch { return fail("NETWORK_UNAVAILABLE"); }
}

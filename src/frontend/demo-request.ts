import { z } from "zod";
import { API_ERROR_CATALOG, type ApiErrorCode } from "@/shared/api-errors";
import { DEMO_REQUEST_CONFIRMATION, type DemoRequestConfirmation } from "@/shared/contact-contracts";

export interface ContactFailure { code: ApiErrorCode | "NETWORK_UNAVAILABLE" | "INVALID_RESPONSE"; status: number | null;
  fields: Record<string, readonly string[]>; diagnosticId?: string }
export type ContactResult = { ok: true; confirmation: DemoRequestConfirmation } | { ok: false; error: ContactFailure };
const confirmation = z.strictObject({ id: z.uuid(), createdAt: z.iso.datetime({ precision: 3 }), message: z.literal(DEMO_REQUEST_CONFIRMATION) });
const fieldMessages = z.array(z.string().max(400)).max(8).optional();
const failure = z.object({ error: z.object({ code: z.string(), requestId: z.uuid(), fields: z.object({
  name: fieldMessages, email: fieldMessages, company: fieldMessages, message: fieldMessages, form: fieldMessages,
}).optional() }) });

/** Captured bytes, one request, no automatic retries or logging of personal data. */
export async function postDemoRequest(body: string, signal: AbortSignal): Promise<ContactResult> {
  const invalid = (code: ContactFailure["code"], status: number | null = null): ContactResult => ({ ok: false, error: { code, status, fields: {} } });
  try {
    const response = await fetch("/api/demo-requests", { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      headers: { "Content-Type": "application/json", "X-Jopoi-Request": "demo", Accept: "application/json" }, body });
    if (!response.headers.get("content-type")?.includes("application/json")) return invalid("INVALID_RESPONSE", response.status);
    const value: unknown = await response.json();
    if (response.status === 200 || response.status === 201) {
      const parsed = confirmation.safeParse(value);
      return parsed.success ? { ok: true, confirmation: parsed.data } : invalid("INVALID_RESPONSE", response.status);
    }
    const parsed = failure.safeParse(value);
    if (!parsed.success) return invalid("INVALID_RESPONSE", response.status);
    const code = Object.keys(API_ERROR_CATALOG).find(key => key === parsed.data.error.code) as ApiErrorCode | undefined;
    if (!code) return invalid("INVALID_RESPONSE", response.status);
    const fields: Record<string, readonly string[]> = {};
    for (const [key, messages] of Object.entries(parsed.data.error.fields ?? {})) if (messages) fields[key] = messages;
    return { ok: false, error: { code, status: response.status, fields, diagnosticId: parsed.data.error.requestId } };
  } catch { return invalid("NETWORK_UNAVAILABLE"); }
}

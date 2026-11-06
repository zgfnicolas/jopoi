import { z } from "zod";
import { type ApiErrorCode } from "@/shared/api-errors";
import { API_ACCEPT, apiMediaType, parseApiFailure } from "@/shared/problem-details";
import { retryAfterSeconds } from "./retry-after";
import { DEMO_REQUEST_CONFIRMATION, type DemoRequestConfirmation } from "@/shared/contact-contracts";
import { getCsrfToken } from "./csrf";

export interface ContactFailure { code: ApiErrorCode | "NETWORK_UNAVAILABLE" | "INVALID_RESPONSE"; status: number | null;
  fields: Record<string, readonly string[]>; diagnosticId?: string; retryAfter?: number }
export type ContactResult = { ok: true; confirmation: DemoRequestConfirmation } | { ok: false; error: ContactFailure };
const confirmation = z.strictObject({ id: z.uuid(), createdAt: z.iso.datetime({ precision: 3 }), message: z.literal(DEMO_REQUEST_CONFIRMATION) });

/** Captured bytes, one request, no automatic retries or logging of personal data. */
export async function postDemoRequest(body: string, signal: AbortSignal, csrfTokenOverride?: string): Promise<ContactResult> {
  const invalid = (code: ContactFailure["code"], status: number | null = null): ContactResult => ({ ok: false, error: { code, status, fields: {} } });
  try {
    const csrf = csrfTokenOverride ?? getCsrfToken() ?? "";
    const response = await fetch("/api/demo-requests", { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      headers: { "Content-Type": "application/json", "X-Jopoi-Request": "demo", Accept: API_ACCEPT, "X-CSRF-Token": csrf }, body });
    if (!["application/json", "application/problem+json"].includes(apiMediaType(response.headers))) return invalid("INVALID_RESPONSE", response.status);
    const value: unknown = await response.json();
    if ((response.status === 200 || response.status === 201) && apiMediaType(response.headers) === "application/json") {
      const parsed = confirmation.safeParse(value);
      return parsed.success ? { ok: true, confirmation: parsed.data } : invalid("INVALID_RESPONSE", response.status);
    }
    const parsed = parseApiFailure(value, response.status, apiMediaType(response.headers));
    if (!parsed) return invalid("INVALID_RESPONSE", response.status);
    const code = parsed.code;
    const fields = parsed.fields;
    const retryAfter = retryAfterSeconds(response);
    return { ok: false, error: { code, status: response.status, fields, ...(parsed.requestId === undefined ? {} : { diagnosticId: parsed.requestId }), ...(retryAfter === undefined ? {} : { retryAfter }) } };
  } catch { return invalid("NETWORK_UNAVAILABLE"); }
}

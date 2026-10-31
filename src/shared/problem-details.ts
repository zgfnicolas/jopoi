import { z } from "zod";
import { API_ERROR_CATALOG, isApiErrorCode, type ApiErrorCode, type FieldErrors } from "./api-errors";

export const PROBLEM_MEDIA_TYPE = "application/problem+json";
export const API_ACCEPT = `${PROBLEM_MEDIA_TYPE}, application/json;q=0.9`;
export const problemType = (code: ApiErrorCode): string => `urn:jopoi:problem:${code.toLowerCase().replaceAll("_", "-")}`;
export const PUBLIC_FIELD_MESSAGES = Object.freeze({
  name: "Ingresá un nombre válido de hasta 120 caracteres.", email: "Ingresá un email válido de hasta 254 caracteres.",
  company: "Ingresá una empresa válida de hasta 160 caracteres.", message: "Ingresá un mensaje válido de hasta 2.000 caracteres.",
  quantityKg: "Revisá la cantidad declarada y sus límites.", humidityPercent: "Revisá la humedad declarada y sus límites.",
  receivedKg: "Revisá el peso recibido y su relación con la declaración.", reasonCode: "Elegí un motivo permitido para esta acción.",
  tripId: "Elegí un viaje compatible del escenario.", role: "Elegí un rol permitido para esta acción.",
  state: "Actualizá la información antes de continuar.", form: "Revisá los campos permitidos y las condiciones de la acción.",
  requestId: "Ingresá un identificador UUID válido.", expectedVersion: "Ingresá una versión positiva válida.",
  traceId: "Ingresá un identificador UUID válido.", eventId: "Ingresá un identificador UUID válido.",
});
/** Elegí mensajes propios por nombre permitido; no reproduzcas valores ni mensajes externos. */
export function publicFields(fields: FieldErrors | undefined): Record<string, readonly string[]> {
  const result: Record<string, readonly string[]> = {};
  for (const [key, message] of Object.entries(PUBLIC_FIELD_MESSAGES)) if (fields && Object.hasOwn(fields, key)) result[key] = [message];
  return result;
}
const fieldsSchema = z.record(z.string().max(40), z.array(z.string().max(400)).max(8)).refine(fields => Object.keys(fields).length <= 16);
export const problemDetailsSchema = z.object({
  type: z.string().max(160), title: z.string().min(1).max(160), status: z.number().int().min(400).max(599),
  detail: z.string().max(400), code: z.string().max(80), requestId: z.uuid(), traceId: z.string().regex(/^[a-f0-9]{32}$/),
  fields: fieldsSchema.optional(),
});
const legacySchema = z.object({ error: z.object({ code: z.string().max(80), requestId: z.uuid(), fields: fieldsSchema.optional() }) });

export function apiMediaType(headers: Headers): string { return headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? ""; }
export function parseApiFailure(value: unknown, status: number, mediaType: string) {
  const parsed = mediaType === PROBLEM_MEDIA_TYPE ? problemDetailsSchema.safeParse(value) : mediaType === "application/json" ? legacySchema.safeParse(value) : null;
  if (!parsed?.success) return null;
  if ("status" in parsed.data && (parsed.data.status !== status || !isApiErrorCode(parsed.data.code) || parsed.data.type !== problemType(parsed.data.code))) return null;
  const data = "error" in parsed.data ? parsed.data.error : parsed.data;
  if (!isApiErrorCode(data.code) || API_ERROR_CATALOG[data.code].status !== status) return null;
  return { code: data.code, requestId: data.requestId, fields: publicFields(data.fields) };
}

/** El cliente anterior no pidió Problem Details; conservá su representación durante el rollout. */
export function acceptsProblemDetails(accept: string | null): boolean {
  let problem = 0, json = 0;
  for (const part of (accept ?? "").slice(0, 2048).split(",").slice(0, 32)) {
    const [type, ...parameters] = part.trim().toLowerCase().split(";");
    const q = parameters.map(value => value.trim()).find(value => value.startsWith("q="));
    const quality = q === undefined ? 1 : /^q=(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(q) ? Number(q.slice(2)) : 0;
    if (type === PROBLEM_MEDIA_TYPE) problem = Math.max(problem, quality);
    if (type === "application/json") json = Math.max(json, quality);
  }
  return problem > 0 && problem >= json;
}

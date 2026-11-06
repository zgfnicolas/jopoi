import { z } from "zod";
import { API_ERROR_CATALOG } from "../../src/shared/api-errors";
import { problemDetailsSchema, PUBLIC_FIELD_MESSAGES } from "../../src/shared/problem-details";
import { commandBody, emptyBody, runIntentBody } from "../../src/shared/request-contracts";
import { demoRequestSchema } from "../../src/shared/demo-request-schema";
import { DEMO_REQUEST_CONFIRMATION } from "../../src/shared/contact-contracts";
import { sessionResponseSchema, runIntentSchema, operationViewSchema, commandResponseSchema, retryResponseSchema } from "../../src/frontend/operation-models";
import { publicTraceSchema, publicVerificationSchema } from "../../src/frontend/trace-models";

const jsonSchema = (schema: z.ZodType) => z.toJSONSchema(schema, { io: "input" });
const uuid = z.uuid(), integer = z.number().int().nonnegative();
const confirmation = z.strictObject({ id: uuid, createdAt: z.iso.datetime({ precision: 3 }), message: z.literal(DEMO_REQUEST_CONFIRMATION) });
const cleanupCounts = z.object({ runs: integer, contacts: integer, sessions: integer, quotas: integer, leases: integer, rateBuckets: integer });
const cleanupCategory = z.enum(["rateBuckets", "runs", "contacts", "sessions", "quotas", "leases"]);
const maintenance = z.discriminatedUnion("skipped", [
  z.object({ skipped: z.literal(true), executionId: uuid, durationMs: integer }),
  z.object({ skipped: z.literal(false), executionId: uuid, durationMs: integer,
    counts: cleanupCounts, pending: cleanupCounts, oldestExpiredAgeMs: integer, withinRetentionTarget: z.boolean(),
    stalledCategories: z.array(cleanupCategory), lastCompletedAt: z.iso.datetime({ precision: 3 }).nullable(),
    lastPartialAt: z.iso.datetime({ precision: 3 }).nullable(),
    cleanupComplete: z.boolean(), complete: z.boolean(), publications: z.object({ processed: integer, hasMore: z.boolean() }),
    publicationError: z.literal("PUBLICATION_WORK_PENDING").nullable() }),
]);
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const header = (description: string) => ({ description, schema: { type: "string" } });
const responseHeaders = { "X-Request-Id": { description: "Referencia interna de diagnóstico, distinta del requestId de intención del cuerpo.", schema: { type: "string", format: "uuid" } },
  "Cache-Control": header("private, no-store para BFF/cron; no-store para trazabilidad pública."), Vary: header("Cookie, Accept; Authorization, Accept en cron; Accept en lectura pública.") };
const errorResponses = Object.fromEntries([...new Set(Object.values(API_ERROR_CATALOG).map(value => value.status))].map(status => [String(status), {
  description: Object.entries(API_ERROR_CATALOG).filter(([, value]) => value.status === status).map(([code]) => code).join(", "),
  headers: { ...responseHeaders, ...([429, 503].includes(status) ? { "Retry-After": header("Plazo conocido en segundos no negativos (hasta 86400); puede omitirse cuando no se conoce. El cliente también acepta fecha HTTP.") } : {}) },
  content: { "application/problem+json": { schema: ref("ProblemDetails") }, "application/json": { schema: ref("LegacyError") } },
}]));
function operation(id: string, summary: string, response: string, statuses: readonly number[], security: "session" | "public" | "cron", input?: string, bodyBytes?: number) {
  return { operationId: id, summary, security: security === "public" ? [] : security === "cron" ? [{ cronBearer: [] }] : [{ demoSession: [] }],
    description: "Errores negociados por Accept: problem+json explícito con calidad no menor a JSON; de otro modo JSON anterior. Presupuesto total acotado (lecturas <= 8 s; mutaciones <= 10 s con lectura de cuerpo <= 3 s; contraste remoto <= 10 s con Mirror Node <= 6 s y paso <= 3 s). Ninguna mutación se reintenta automáticamente ni se trata como revertida si el cliente corta la conexión. Los requestId de intención se conservan al repetir los mismos bytes; otra intención con igual clave devuelve 409. Confirmar SQL no confirma HCS.",
    ...(input === undefined ? {} : { requestBody: { required: true, content: { "application/json": { schema: ref(input) } } },
      parameters: [{ name: "Origin", in: "header", required: true, schema: { type: "string", format: "uri" }, description: "Origen APP_URL configurado, sin aceptar Host del visitante." },
        { name: "X-Jopoi-Request", in: "header", required: true, schema: { const: "demo" } },
        ...(security === "session"
          ? [{ name: "X-CSRF-Token", in: "header", required: true, schema: { type: "string" }, description: "Token CSRF vinculado a la sesión, no persistido y entregado por GET o POST /api/demo/session." }]
          : [{ name: "X-CSRF-Token", in: "header", required: false, schema: { type: "string" }, description: "Token CSRF opcional en bootstrap anónimo; requerido una vez establecida la cookie de sesión." }])],
      "x-max-body-bytes": bodyBytes }),
    responses: { ...errorResponses, ...Object.fromEntries(statuses.map(status => [String(status), { description: status === 202 ? "Reintento aceptado; consultar el recorrido para su estado de publicación." : status === 201 ? "Creación confirmada en SQL." : "Lectura, resultado o replay confirmado.",
      headers: { ...responseHeaders,
        ...(id === "readSession" || id === "createSession" ? { "X-CSRF-Token": header("Token CSRF vinculado a la sesión, entregado sin crear sesión ni escribir por GET; no-store.") } : {}),
        ...(id === "createSession" ? { "Set-Cookie": header("__Host-jopoi_session en HTTPS (Secure; HttpOnly; SameSite=Lax; Path=/; sin Domain) o jopoi_session en HTTP local; vencimiento absoluto de siete días.") } : {}) },
      content: { "application/json": { schema: ref(response) } } }])) } };
}
const pathParameters = (...names: string[]) => names.map(name => ({ name, in: "path", required: true, schema: { type: "string", format: "uuid" } }));

export function buildOpenApi() {
  const problem = jsonSchema(problemDetailsSchema);
  return { openapi: "3.2.0", info: { title: "Jopói · API actual", version: "0.1.0", description: "Demo de presupuesto cero; roles simulados y HCS testnet. Inventario del ticket S22-09. No incluye rutas futuras, autenticación por rol real, ETag ni capacidades aún no implementadas. La validación de dominio e integridad entre campos se comprueba además por HTTP." },
    servers: [{ url: "/" }],
    paths: {
      "/api/demo/session": { get: { ...operation("readSession", "Recuperar sesión y recorrido activo", "SessionResponse", [200], "session"), "x-rate-limit": "30 por sesión / 1000 global cada 60 segundos" },
        post: { ...operation("createSession", "Recuperar o crear sesión", "SessionResponse", [200, 201], "public", "EmptyBody", 4096), "x-rate-limit": "20 por visitante / 200 global cada 600 segundos; hasta 100 sesiones nuevas por día UTC global (recuperar una sesión vigente no consume cupo de creación)" } },
      "/api/demo/runs": { post: { ...operation("startRun", "Crear o resolver intención de inicio", "RunIntent", [200, 201], "session", "RunIntentInput", 4096), "x-rate-limit": "10 intentos de mutación por sesión / 100 global cada 60 segundos; hasta 100 intenciones nuevas por sesión y 5000 por día UTC global (repetir una intención confirmada no consume otro cupo de intención ni de recorrido)" } },
      "/api/demo/runs/reset": { post: { ...operation("resetRun", "Crear recorrido de reinicio", "RunIntent", [200, 201], "session", "RunIntentInput", 4096), "x-rate-limit": "10 intentos de mutación por sesión / 100 global cada 60 segundos; hasta 100 intenciones nuevas por sesión y 5000 por día UTC global (repetir una intención confirmada no consume otro cupo de intención ni de recorrido)" } },
      "/api/demo/runs/current": { get: { ...operation("readCurrentRun", "Consultar recorrido actual", "RunResponse", [200], "session"), "x-rate-limit": "30 por sesión / 1000 global cada 60 segundos" } },
      "/api/demo/runs/{traceId}": { parameters: pathParameters("traceId"), get: { ...operation("readRun", "Consultar recorrido propio", "RunResponse", [200], "session"), "x-rate-limit": "30 por sesión / 1000 global cada 60 segundos" } },
      "/api/demo/runs/{traceId}/commands": { parameters: pathParameters("traceId"), post: { ...operation("commandRun", "Aplicar o repetir intención operativa", "CommandResponse", [200], "session", "CommandInput", 4096), "x-rate-limit": "10 intentos de mutación por sesión / 100 global cada 60 segundos; 6 activaciones de publicación por sesión / 60 global cada 60 segundos cuando la acción emite hito; hasta 100 recibos por recorrido y 5000 intenciones nuevas por día UTC global (repetir una intención confirmada no consume otro recibo)" } },
      "/api/demo/runs/{traceId}/events/{eventId}/retry": { parameters: pathParameters("traceId", "eventId"), post: { ...operation("retryPublication", "Reconciliar o autorizar reintento de publicación", "RetryResponse", [200, 202], "session", "RunIntentInput", 4096), "x-rate-limit": "10 intentos de mutación por sesión / 100 global cada 60 segundos y 6 activaciones de publicación por sesión / 60 global cada 60 segundos; comparte el techo de 100 recibos por recorrido y 5000 intenciones nuevas por día UTC global (repetir una intención confirmada no consume otro recibo)" } },
      "/api/traces/{traceId}": { parameters: pathParameters("traceId"), get: { ...operation("readTrace", "Consultar trazabilidad pública vigente", "PublicTrace", [200], "public"), "x-rate-limit": "120 por visitante / 1000 global cada 60 segundos" } },
      "/api/traces/{traceId}/events/{eventId}/verification": { parameters: pathParameters("traceId", "eventId"), get: { ...operation("verifyTraceEvent", "Contrastar evidencia pública en mirror", "PublicVerification", [200], "public"), "x-rate-limit": "30 por visitante / 300 global cada 60 segundos" } },
      "/api/demo-requests": { post: { ...operation("createContact", "Guardar solicitud de demo sin exponer PII", "ContactConfirmation", [200, 201], "public", "ContactInput", 16384), "x-rate-limit": "5 por visitante / 100 global cada 3600 segundos; hasta 100 solicitudes nuevas por día UTC global (un replay confirmado no consume otro cupo de creación)" } },
      "/api/cron": { get: { ...operation("maintenance", "Comando administrativo de mantenimiento", "Maintenance", [200], "cron"), description: "Excepción heredada: GET administrativo con efectos, autenticado por Bearer de cron; nunca cachear ni ejecutar desde navegadores. Lease compartido y limpieza acotada; complete=false no acredita limpieza total." } },
    },
    components: { securitySchemes: { demoSession: { type: "apiKey", in: "cookie", name: "__Host-jopoi_session", description: "Credencial opaca restringida al host en HTTPS (__Host-jopoi_session; Secure; HttpOnly; SameSite=Lax; Path=/; sin Domain) o jopoi_session en HTTP local; ownership y vigencia verificados en servidor. Roles del escenario son simulados. Máximo tres recorridos por sesión; sesión siete días, escritura 24 horas y lectura pública siete días por recorrido." }, cronBearer: { type: "http", scheme: "bearer", description: "Secreto de mantenimiento, solo servidor/cron." } },
      schemas: { EmptyBody: jsonSchema(emptyBody), RunIntentInput: jsonSchema(runIntentBody), CommandInput: jsonSchema(commandBody), ContactInput: { ...jsonSchema(demoRequestSchema), examples: [{ requestId: "00000000-0000-4000-8000-000000000001", name: "Persona sintética", email: "demo@example.invalid", company: "Empresa ficticia", message: "Solicitud de ejemplo." }] },
        SessionResponse: jsonSchema(sessionResponseSchema), RunIntent: jsonSchema(runIntentSchema), RunResponse: jsonSchema(operationViewSchema), CommandResponse: jsonSchema(commandResponseSchema), RetryResponse: jsonSchema(retryResponseSchema),
        PublicTrace: jsonSchema(publicTraceSchema), PublicVerification: jsonSchema(publicVerificationSchema), ContactConfirmation: jsonSchema(confirmation), Maintenance: jsonSchema(maintenance),
        ProblemDetails: { ...problem, examples: [{ type: "urn:jopoi:problem:invalid-input", title: "Solicitud inválida", status: 400, detail: API_ERROR_CATALOG.INVALID_INPUT.message, code: "INVALID_INPUT", requestId: "00000000-0000-4000-8000-000000000001", traceId: "11111111111111111111111111111111" }], properties: { ...problem.properties, code: { type: "string", enum: Object.keys(API_ERROR_CATALOG) }, fields: { type: "object", additionalProperties: false, properties: Object.fromEntries(Object.entries(PUBLIC_FIELD_MESSAGES).map(([key, message]) => [key, { type: "array", items: { const: message }, maxItems: 1 }])) } } },
        LegacyError: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "message", "requestId"], properties: { code: { type: "string", enum: Object.keys(API_ERROR_CATALOG) }, message: { type: "string" }, requestId: { type: "string", format: "uuid" }, fields: { type: "object", additionalProperties: { type: "array", items: { type: "string" } } } } } } },
      } },
  };
}

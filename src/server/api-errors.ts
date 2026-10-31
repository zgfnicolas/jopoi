import "server-only";

import { createRequestContext, type RequestContext } from "./diagnostics";
export { createRequestContext, type RequestContext } from "./diagnostics";

import {
  API_ERROR_CATALOG,
  type ApiErrorBody,
  type ApiErrorStatus,
} from "../shared/api-errors";
import { ApplicationError } from "./application-error";
import { publicFields, problemType } from "../shared/problem-details";

export { ApplicationError } from "./application-error";

/** Solo serializa el contrato público, nunca la excepción o el mensaje del proveedor. */
export function toApiError(
  error: unknown,
  context: RequestContext = createRequestContext(),
): { readonly status: ApiErrorStatus; readonly body: ApiErrorBody } {
  const code = error instanceof ApplicationError ? error.code : "INTERNAL_ERROR";
  const definition = API_ERROR_CATALOG[code];
  const fields = error instanceof ApplicationError && definition.status < 500 && error.fields !== undefined ? publicFields(error.fields) : undefined;

  return {
    status: definition.status,
    body: {
      error: {
        code,
        message: definition.message,
        requestId: context.requestId,
        ...(fields === undefined ? {} : { fields }),
      },
    },
  };
}

export function toProblemDetails(body: ApiErrorBody, context: RequestContext) {
  const { code, requestId, fields } = body.error;
  const definition = API_ERROR_CATALOG[code];
  const titles = { 400: "Solicitud inválida", 401: "Autenticación requerida", 403: "Acceso denegado", 404: "Recurso no disponible", 409: "Conflicto", 410: "Recurso vencido", 422: "Acción inválida", 429: "Límite alcanzado", 500: "Error interno", 503: "Servicio no disponible" };
  return { type: problemType(code), title: titles[definition.status], status: definition.status, detail: definition.message,
    code, requestId, traceId: context.telemetryTraceId, ...(fields === undefined ? {} : { fields }) };
}

import "server-only";

import { randomUUID } from "node:crypto";

import {
  API_ERROR_CATALOG,
  type ApiErrorBody,
  type ApiErrorCode,
  type ApiErrorStatus,
  type FieldErrors,
} from "../shared/api-errors";

export interface RequestContext {
  readonly requestId: string;
}

/** Crear una vez por solicitud; nunca copiar identificadores de headers del visitante. */
export function createRequestContext(): RequestContext {
  return Object.freeze({ requestId: randomUUID() });
}

export class ApplicationError extends Error {
  readonly code: ApiErrorCode;
  readonly fields?: FieldErrors;

  constructor(code: ApiErrorCode, fields?: FieldErrors) {
    super(API_ERROR_CATALOG[code].message);
    this.name = "ApplicationError";
    this.code = code;
    this.fields = fields;
  }
}

/** Solo serializa el contrato público, nunca la excepción o el mensaje del proveedor. */
export function toApiError(
  error: unknown,
  context: RequestContext = createRequestContext(),
): { readonly status: ApiErrorStatus; readonly body: ApiErrorBody } {
  const code = error instanceof ApplicationError ? error.code : "INTERNAL_ERROR";
  const definition = API_ERROR_CATALOG[code];
  const fields = error instanceof ApplicationError ? error.fields : undefined;

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

import "server-only";

import { createRequestContext, type RequestContext } from "./diagnostics";
export { createRequestContext, type RequestContext } from "./diagnostics";

import {
  API_ERROR_CATALOG,
  type ApiErrorBody,
  type ApiErrorStatus,
} from "../shared/api-errors";
import { ApplicationError } from "./application-error";

export { ApplicationError } from "./application-error";

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

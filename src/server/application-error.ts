import { API_ERROR_CATALOG, type ApiErrorCode, type FieldErrors } from "../shared/api-errors";

/** Núcleo privado reutilizable por servidor y CLI, sin depender del marcador de React. */
export class ApplicationError extends Error {
  readonly code: ApiErrorCode;
  readonly fields?: FieldErrors;

  constructor(code: ApiErrorCode, fields?: FieldErrors, options?: ErrorOptions) {
    super(API_ERROR_CATALOG[code].message, options);
    this.name = "ApplicationError";
    this.code = code;
    if (fields !== undefined) this.fields = fields;
  }
}

import type { ApiErrorCode, FieldErrors } from "../shared/api-errors";

/** Resultado de dominio; el adaptador HTTP de S01 añade mensaje y requestId. */
type ValidationErrorCode = Extract<ApiErrorCode, "INVALID_INPUT" | "RULE_VIOLATION">;

export interface DomainFailure<Code extends ApiErrorCode = ValidationErrorCode> {
  readonly ok: false;
  readonly error: {
    readonly code: Code;
    readonly fields: FieldErrors;
  };
}

export type DomainResult<T, Code extends ApiErrorCode = ValidationErrorCode> = { readonly ok: true; readonly value: T } | DomainFailure<Code>;

export function invalidField(
  field: string,
  message: string,
  code: DomainFailure["error"]["code"] = "INVALID_INPUT",
): DomainFailure {
  return { ok: false, error: { code, fields: { [field]: [message] } } };
}

import type { ApiErrorCode, FieldErrors } from "../shared/api-errors";

/** Resultado de dominio; el adaptador HTTP de S01 añade mensaje y requestId. */
export interface DomainFailure {
  readonly ok: false;
  readonly error: {
    readonly code: Extract<ApiErrorCode, "INVALID_INPUT" | "RULE_VIOLATION">;
    readonly fields: FieldErrors;
  };
}

export type DomainResult<T> = { readonly ok: true; readonly value: T } | DomainFailure;

export function invalidField(
  field: string,
  message: string,
  code: DomainFailure["error"]["code"] = "INVALID_INPUT",
): DomainFailure {
  return { ok: false, error: { code, fields: { [field]: [message] } } };
}

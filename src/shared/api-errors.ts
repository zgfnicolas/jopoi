/** Contrato público: no importar configuración, proveedores ni módulos de servidor. */
export const API_ERROR_CATALOG = Object.freeze({
  INVALID_INPUT: { status: 400, message: "Revisá los datos ingresados." },
  SESSION_REQUIRED: { status: 401, message: "Necesitás iniciar una sesión de demostración." },
  SESSION_EXPIRED: { status: 401, message: "Tu sesión venció. Iniciá una nueva demostración." },
  WRONG_ROLE: { status: 403, message: "El rol seleccionado no permite realizar esta acción." },
  NOT_FOUND: { status: 404, message: "El recurso solicitado no está disponible." },
  STATE_CONFLICT: { status: 409, message: "El estado actual no permite esta acción. Actualizá la información." },
  VERSION_CONFLICT: { status: 409, message: "La información cambió. Actualizala antes de continuar." },
  IDEMPOTENCY_CONFLICT: { status: 409, message: "La solicitud ya se utilizó con una intención diferente." },
  TRACE_EXPIRED: { status: 410, message: "El período de consulta de esta trazabilidad venció." },
  RULE_VIOLATION: { status: 422, message: "La acción no cumple las condiciones de la demostración." },
  RUN_LIMIT_REACHED: { status: 429, message: "Alcanzaste el límite de recorridos de esta sesión." },
  DATABASE_UNAVAILABLE: { status: 503, message: "El servicio de datos no está disponible. Intentá nuevamente más tarde." },
  CONFIGURATION_UNAVAILABLE: { status: 503, message: "El servicio necesario no está configurado correctamente. Intentá nuevamente más tarde." },
  INTERNAL_ERROR: { status: 500, message: "No pudimos completar la solicitud. Intentá nuevamente más tarde." },
} as const);

export type ApiErrorCode = keyof typeof API_ERROR_CATALOG;
export type ApiErrorStatus = (typeof API_ERROR_CATALOG)[ApiErrorCode]["status"];
export type FieldErrors = Readonly<Record<string, readonly string[]>>;

export interface ApiErrorBody {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
    readonly requestId: string;
    /** Solo nombres de campos y mensajes públicos redactados por la aplicación. */
    readonly fields?: FieldErrors;
  };
}

/** Límites técnicos para API y formulario; longitudes en unidades UTF-16. */
export const DEMO_REQUEST_LIMITS = Object.freeze({
  name: 120,
  email: 254,
  company: 160,
  message: 2000,
  bodyBytes: 16 * 1024,
});

export interface DemoRequestInput {
  readonly requestId: string;
  readonly name: string;
  readonly email: string;
  readonly company: string;
  readonly message?: string;
}

/** No incluye datos personales ni permite recuperarlos mediante el identificador. */
export interface DemoRequestConfirmation {
  readonly id: string;
  readonly createdAt: string;
  readonly message: string;
}

export const DEMO_REQUEST_CONFIRMATION = "Tu solicitud para conocer el prototipo quedó guardada.";

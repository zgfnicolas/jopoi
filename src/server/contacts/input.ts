import "server-only";

import { z } from "zod";
import { DEMO_REQUEST_LIMITS } from "../../shared/contact-contracts";
import { ApplicationError } from "../application-error";

const singleLine = z.string().refine((value) => !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)).transform((value) => value.trim());
const schema = z.strictObject({
  requestId: z.uuid().transform((value) => value.toLowerCase()),
  name: singleLine.pipe(z.string().min(1).max(DEMO_REQUEST_LIMITS.name)),
  email: singleLine.pipe(z.string().max(DEMO_REQUEST_LIMITS.email).pipe(z.email())),
  company: singleLine.pipe(z.string().min(1).max(DEMO_REQUEST_LIMITS.company)),
  message: z.string()
    .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value))
    .transform((value) => value.replace(/\r\n?/g, "\n").trim())
    .pipe(z.string().max(DEMO_REQUEST_LIMITS.message))
    .optional()
    .transform((value) => value === undefined || value === "" ? null : value),
});

export type NormalizedDemoRequestInput = z.output<typeof schema>;

const messages = new Map([
  ["requestId", "Ingresá un identificador UUID válido."],
  ["name", `Ingresá un nombre de hasta ${DEMO_REQUEST_LIMITS.name} caracteres, en una línea.`],
  ["email", `Ingresá un email válido de hasta ${DEMO_REQUEST_LIMITS.email} caracteres.`],
  ["company", `Ingresá una empresa de hasta ${DEMO_REQUEST_LIMITS.company} caracteres, en una línea.`],
  ["message", `Ingresá un mensaje de hasta ${DEMO_REQUEST_LIMITS.message} caracteres, sin controles no permitidos.`],
]);

export function parseDemoRequest(value: unknown): NormalizedDemoRequestInput {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const fields: Record<string, readonly string[]> = {};
  for (const issue of parsed.error.issues) {
    const field = typeof issue.path[0] === "string" ? issue.path[0] : "form";
    const message = messages.get(field);
    if (message === undefined) fields.form = ["Enviá únicamente los campos permitidos de la solicitud."];
    else fields[field] = [message];
  }
  throw new ApplicationError("INVALID_INPUT", fields);
}

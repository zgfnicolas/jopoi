import "server-only";
import { demoRequestSchema, demoRequestFieldErrors, type NormalizedDemoRequestInput } from "../../shared/demo-request-schema";
import { ApplicationError } from "../application-error";
export type { NormalizedDemoRequestInput } from "../../shared/demo-request-schema";

export function parseDemoRequest(value: unknown): NormalizedDemoRequestInput {
  const parsed = demoRequestSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new ApplicationError("INVALID_INPUT", demoRequestFieldErrors(parsed.error.issues));
}

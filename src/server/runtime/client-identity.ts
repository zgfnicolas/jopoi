import "server-only";
import { normalizeClientAddress } from "../security/visitor-identity";

export function clientIdentity(request: Request): string {
  // Un flag de despliegue, nunca un header del visitante, define si el ingreso es confiable.
  return normalizeClientAddress(request.headers.get("x-vercel-forwarded-for"), process.env.VERCEL === "1");
}

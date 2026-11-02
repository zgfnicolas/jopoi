import { isIP } from "node:net";
import { normalizeClientAddress } from "../../src/server/security/visitor-identity";

/** Replaced only by the sealed, owned development test harness. */
export function clientIdentity(request: Request): string {
  const header = request.headers.get("x-s21-visitor")?.trim();
  if (!header) return "local-shared";
  return isIP(header) ? normalizeClientAddress(header, true) : header.slice(0, 80);
}

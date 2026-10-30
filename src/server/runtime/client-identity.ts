import "server-only";
import { isIP } from "node:net";

export function clientIdentity(request: Request): string {
  // A deployment flag, not a request header, establishes the trusted ingress.
  if (process.env.VERCEL !== "1") return "local-shared";
  const raw = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (!raw || !isIP(raw)) return "unknown-shared";
  const normalized = raw.includes(":") ? new URL(`http://[${raw}]/`).hostname : raw;
  return normalized.toLowerCase();
}

import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getServerConfig, requireConfiguration } from "../config";

export const SESSION_COOKIE = "jopoi_session";
export const HOST_SESSION_COOKIE = "__Host-jopoi_session";

export interface SessionCredentials {
  readonly token: string | undefined;
  readonly isHttps: boolean;
  readonly ambiguous: boolean;
  readonly legacyMigrating: boolean;
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** La clave privada se exige al usar sesiones, nunca durante la importación. */
export function sessionTokenHash(token: string | undefined): string | undefined {
  if (token === undefined || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
  const { secret } = requireConfiguration(getServerConfig().session());
  return createHmac("sha256", secret).update(token).digest("hex");
}

/**
 * Política explícita por entorno: HTTPS usa el prefijo __Host- (Secure, sin Domain, Path=/),
 * HTTP local conserva el nombre sin prefijo y sin Secure. Pura para poder probarla sin TLS.
 */
export function sessionCookiePolicy(isHttps: boolean) {
  return {
    name: isHttps ? HOST_SESSION_COOKIE : SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isHttps,
    path: "/",
  };
}

/** Token CSRF vinculado a la sesión, derivado de la credencial; no es la credencial y no se persiste. */
export function csrfToken(token: string | undefined): string | undefined {
  if (token === undefined || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
  const { secret } = requireConfiguration(getServerConfig().session());
  return createHmac("sha256", secret).update(`csrf-v1:${token}`).digest("base64url");
}

/** Comparación en tiempo constante; rechaza ausencia o longitud distinta. */
export function csrfTokenMatches(provided: string | undefined, expected: string | undefined): boolean {
  if (provided === undefined || expected === undefined || provided.length === 0 || expected.length === 0) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseCookies(header: string | null | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const val = trimmed.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(val);
  }
  return cookies;
}

export function isHttpsRequest(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) {
    const proto = forwarded.split(",")[0]?.trim().toLowerCase();
    if (proto === "https") return true;
    if (proto === "http") return false;
  }
  try {
    if (new URL(request.url).protocol === "https:") return true;
  } catch {
    // fallback
  }
  try {
    const origin = getServerConfig().origin();
    if (origin.status === "configured" && origin.config.url.startsWith("https:")) return true;
  } catch {
    // fallback
  }
  return false;
}

export function extractSessionCredentials(request: Request): SessionCredentials {
  const isHttps = isHttpsRequest(request);
  const cookieHeader = request.headers.get("cookie");
  const cookies = parseCookies(cookieHeader);
  const hostVal = cookies[HOST_SESSION_COOKIE];
  const legacyVal = cookies[SESSION_COOKIE];

  if (hostVal !== undefined && legacyVal !== undefined) {
    if (hostVal !== legacyVal) {
      return { token: undefined, isHttps, ambiguous: true, legacyMigrating: false };
    }
    return { token: hostVal, isHttps, ambiguous: false, legacyMigrating: isHttps };
  }

  if (hostVal !== undefined) {
    return { token: hostVal, isHttps, ambiguous: false, legacyMigrating: false };
  }

  if (legacyVal !== undefined) {
    return { token: legacyVal, isHttps, ambiguous: false, legacyMigrating: isHttps };
  }

  return { token: undefined, isHttps, ambiguous: false, legacyMigrating: false };
}

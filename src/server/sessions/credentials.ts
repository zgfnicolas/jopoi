import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { getServerConfig, requireConfiguration } from "../config";

export const SESSION_COOKIE = "jopoi_session";

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** La clave privada se exige al usar sesiones, nunca durante la importación. */
export function sessionTokenHash(token: string | undefined): string | undefined {
  const { secret } = requireConfiguration(getServerConfig().session());
  if (token === undefined || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
  return createHmac("sha256", secret).update(token).digest("hex");
}

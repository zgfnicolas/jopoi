import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { ApplicationError } from "../application-error";

/**
 * Normaliza la identidad de red del visitante sin conservar la IP en persistencia ni logs:
 * - Fuera del ingreso confiable (VERCEL !== "1") agrupa en "local-shared" e ignora cabeceras reenviadas.
 * - En ingreso confiable sin IP única válida agrupa en "unknown-shared".
 * - IPv4 e IPv4-mapped IPv6 (::ffff:a.b.c.d) comparten el mismo grupo NAT /32.
 * - IPv6 agrupa por prefijo /64 para que rotar sufijos de privacidad (RFC 8981) no multiplique el cupo.
 */
export function normalizeClientAddress(raw: string | null | undefined, trustedIngress: boolean): string {
  if (!trustedIngress) return "local-shared";
  const trimmed = raw?.trim();
  if (!trimmed || trimmed.includes("%")) return "unknown-shared";
  const version = isIP(trimmed);
  if (version === 4) {
    try { return `ipv4:${new URL(`http://${trimmed}/`).hostname}/32`; }
    catch { return "unknown-shared"; }
  }
  if (version !== 6) return "unknown-shared";
  try {
    const canonical = new URL(`http://[${trimmed}]/`).hostname.slice(1, -1).toLowerCase();
    const [left = "", right = ""] = canonical.split("::");
    const head = left === "" ? [] : left.split(":");
    const tail = canonical.includes("::") ? (right === "" ? [] : right.split(":")) : [];
    const parts = canonical.includes("::")
      ? [...head, ...Array.from({ length: Math.max(0, 8 - head.length - tail.length) }, () => "0"), ...tail]
      : canonical.split(":");
    if (parts.length !== 8) return "unknown-shared";
    const hextets = parts.map((part) => Number.parseInt(part, 16));
    if (hextets.some((value) => !Number.isInteger(value) || value < 0 || value > 0xffff)) return "unknown-shared";
    if (hextets[0] === 0 && hextets[1] === 0 && hextets[2] === 0 && hextets[3] === 0 && hextets[4] === 0 && hextets[5] === 0xffff) {
      const high = hextets[6] ?? 0;
      const low = hextets[7] ?? 0;
      return `ipv4:${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}/32`;
    }
    return `ipv6:${hextets.slice(0, 4).map((value) => value.toString(16).padStart(4, "0")).join(":")}::/64`;
  } catch {
    return "unknown-shared";
  }
}

/** Deriva un sujeto HMAC-SHA-256 rotado por día UTC y separado por propósito/ámbito. */
export function visitorSubject(secret: string | undefined, at: Date, scope: string, identity: string): string {
  if (!secret || secret.trim().length < 32 || !Number.isFinite(at.getTime()) || scope.length === 0 || identity.length === 0) {
    throw new ApplicationError("CONFIGURATION_UNAVAILABLE");
  }
  const day = at.toISOString().slice(0, 10);
  const dailyKey = createHmac("sha256", secret).update(`s22-visitor-key-v1\0${day}`).digest();
  return createHmac("sha256", dailyKey).update(`s21-rate-v1\0${scope}\0${identity}`).digest("hex");
}

import "server-only";

import { createHash } from "node:crypto";
import { canonicalJson } from "../../domain/canonical-json";
import type { OperationResource } from "../../shared/run-contracts";

/**
 * ETag fuerte del subrecurso de operación privada.
 * RFC 9110: entidad opaca entre comillas dobles, representando exactamente el contenido/versión.
 */
export function computeOperationEtag(resource: OperationResource): string {
  const hash = createHash("sha256").update(
    canonicalJson({
      traceId: resource.traceId.toLowerCase(),
      version: resource.version,
      operation: resource.operation,
    }),
    "utf8",
  ).digest("hex");
  return `"${hash}"`;
}

/**
 * ETag del recurso de recorrido completo (incluye cuotas y publicaciones).
 * RFC 9110: garantiza que cambios en publicación o cuotas cambien este ETag
 * sin reutilizar indebidamente el ETag de la operación.
 */
export function computeRunEtag(run: unknown): string {
  const hash = createHash("sha256").update(canonicalJson(run), "utf8").digest("hex");
  return `"${hash}"`;
}

/**
 * ETag de la respuesta de trazabilidad pública (/api/v1/traces/{traceId} y /api/traces/{traceId}).
 * RFC 9110: entidad opaca entre comillas dobles, representando la proyección pública completa.
 */
export function computeTraceEtag(trace: unknown): string {
  const hash = createHash("sha256").update(canonicalJson(trace), "utf8").digest("hex");
  return `"${hash}"`;
}

export function parseEtags(header: string): string[] {
  return header
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function matchesIfMatch(header: string | null | undefined, currentEtag: string): boolean {
  if (!header) return false;
  const trimmed = header.trim();
  if (trimmed === "*") return true;
  const tags = parseEtags(trimmed);
  const target = currentEtag.replaceAll('"', "");
  return tags.some((tag) => tag === currentEtag || tag.replaceAll('"', "") === target);
}

export function matchesIfNoneMatch(header: string | null | undefined, currentEtag: string): boolean {
  if (!header) return false;
  const trimmed = header.trim();
  if (trimmed === "*") return true;
  const tags = parseEtags(trimmed);
  const target = currentEtag.replaceAll('"', "");
  return tags.some((tag) => tag === currentEtag || tag.replaceAll('"', "") === target);
}

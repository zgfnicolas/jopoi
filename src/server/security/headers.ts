import { THEME_BOOTSTRAP } from "../../frontend/theme";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * SHA-256 digest of the static theme bootstrap script.
 * Verified to match THEME_BOOTSTRAP in src/frontend/theme.ts.
 */
export const THEME_BOOTSTRAP_HASH = `sha256-${crypto.createHash("sha256").update(THEME_BOOTSTRAP).digest("base64")}`;

/**
 * SHA-256 digests of Next.js Turbopack inline scripts emitted for static pages.
 * These hashes authorize Turbopack chunk loaders, Next.js hydration pushes,
 * and static RSC payloads without requiring unsafe-inline.
 */
export const NEXT_TURBOPACK_HASH = "sha256-TgZfvn9usalJcVQMd2GzKrTXfkw6cu3heZ/kjGPN4HI=";
export const NEXT_INIT_PUSH_HASH = "sha256-OBTN3RiyCV4Bq7dFqZ5a2pAXjnCcCYeTJMO2I/LYKeo=";
export const NEXT_INDEX_RSC_HASH = "sha256-rJcO3CtCpfnrWCAqOahemninmWLJ86fr3NTxL0OjOEE=";
export const NEXT_DEMO_RSC_HASH = "sha256-TMz5q7dO4waEzw2OPxXK+xdKjl7H/1RqweZusstpsgQ=";

export const STATIC_SCRIPT_HASHES: readonly string[] = [
  THEME_BOOTSTRAP_HASH,
  NEXT_TURBOPACK_HASH,
  NEXT_INIT_PUSH_HASH,
  NEXT_INDEX_RSC_HASH,
  NEXT_DEMO_RSC_HASH,
];

let cachedBuildHashes: string[] | null = null;

/**
 * Extracts inline script SHA-256 hashes from statically rendered HTML files
 * in the build output directory (.next/server/app).
 * Allows static prerendered pages to be verified with strict CSP without unsafe-inline.
 */
export function collectBuildScriptHashes(distDir = ".next"): readonly string[] {
  if (cachedBuildHashes) return cachedBuildHashes;
  const hashes = new Set<string>();

  try {
    const appDir = path.resolve(distDir, "server", "app");
    if (fs.existsSync(appDir)) {
      const files = fs.readdirSync(appDir, { recursive: true }) as string[];
      for (const file of files) {
        if (typeof file === "string" && file.endsWith(".html")) {
          const fullPath = path.join(appDir, file);
          const content = fs.readFileSync(fullPath, "utf8");
          const matches = content.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi);
          for (const match of matches) {
            const code = match[1]?.trim();
            if (code) {
              const hash = `sha256-${crypto.createHash("sha256").update(code).digest("base64")}`;
              hashes.add(hash);
            }
          }
        }
      }
    }
  } catch {
    // If running before build or in an isolated harness without server directory, proceed with defaults
  }

  cachedBuildHashes = Array.from(hashes);
  return cachedBuildHashes;
}

export function resetBuildScriptHashesCache(): void {
  cachedBuildHashes = null;
}

export interface CspOptions {
  nonce?: string;
  isDev?: boolean;
  reportOnly?: boolean;
  additionalHashes?: string[];
  distDir?: string;
}

export function buildContentSecurityPolicy(options: CspOptions = {}): string {
  const isDev = options.isDev ?? process.env.NODE_ENV === "development";
  const buildHashes = collectBuildScriptHashes(options.distDir);
  const combinedHashes = new Set<string>([...STATIC_SCRIPT_HASHES, ...buildHashes]);

  const scriptSources = [
    "'self'",
    ...Array.from(combinedHashes).map(h => (h.startsWith("sha256-") ? `'${h}'` : `'sha256-${h}'`)),
    ...(options.additionalHashes ?? []).map(h => {
      const trimmed = h.trim();
      return trimmed.startsWith("'") ? trimmed : trimmed.startsWith("sha256-") ? `'${trimmed}'` : `'sha256-${trimmed}'`;
    }),
  ];

  if (options.nonce) {
    scriptSources.push(`'nonce-${options.nonce}'`);
  }

  if (isDev) {
    scriptSources.push("'unsafe-eval'");
  }

  const directives: Record<string, string> = {
    "default-src": "'self'",
    "script-src": scriptSources.join(" "),
    "style-src": "'self' 'unsafe-inline'",
    "img-src": "'self' data:",
    "font-src": "'self'",
    "connect-src": "'self' https://testnet.mirrornode.hedera.com",
    "object-src": "'none'",
    "base-uri": "'none'",
    "form-action": "'self'",
    "frame-ancestors": "'none'",
  };

  return Object.entries(directives)
    .map(([key, val]) => `${key} ${val};`)
    .join(" ");
}

export interface SecurityHeadersOptions extends CspOptions {
  isHttps?: boolean;
}

export function getSecurityHeaders(options: SecurityHeadersOptions = {}): Record<string, string> {
  const reportOnly = options.reportOnly ?? process.env.JOPOI_CSP_REPORT_ONLY === "true";
  const cspHeaderName = reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
  const cspValue = buildContentSecurityPolicy(options);

  const headers: Record<string, string> = {
    [cspHeaderName]: cspValue,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
  };

  if (options.isHttps) {
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
  }

  return headers;
}

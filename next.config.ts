import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { buildContentSecurityPolicy } from "./src/server/security/headers";

export default function configuration(phase: string): NextConfig {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;
  const reportOnly = process.env.JOPOI_CSP_REPORT_ONLY === "true";
  const cspHeaderKey = reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
  const cspHeaderValue = buildContentSecurityPolicy({ isDev, reportOnly });

  const config: NextConfig = {
    serverExternalPackages: ["@hiero-ledger/sdk"],
    async headers() {
      return [
        { source: "/api/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
        {
          source: "/(.*)",
          headers: [
            { key: cspHeaderKey, value: cspHeaderValue },
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
            { key: "X-Frame-Options", value: "DENY" },
          ],
        },
        {
          source: "/(.*)",
          has: [{ type: "header", key: "x-forwarded-proto", value: "https" }],
          headers: [
            { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          ],
        },
      ];
    },
  };
  const directory = process.env.JOPOI_API_TEST_DIRECTORY;
  if (!directory) return config;
  const root = resolve(".cache", "api-tests");
  const target = resolve(directory);
  if (phase !== PHASE_DEVELOPMENT_SERVER || process.env.VERCEL || !target.startsWith(root + sep)) {
    throw new Error("API_TEST_ENVIRONMENT_FORBIDDEN");
  }
  const marker = JSON.parse(readFileSync(resolve(target, "owner.json"), "utf8"));
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (marker.token !== process.env.JOPOI_API_TEST_TOKEN || database.hostname !== "127.0.0.1"
    || database.port !== String(marker.pgPort) || database.pathname !== "/s17_api"
    || ![marker.httpPort, marker.secondaryHttpPort].some(port => process.env.APP_URL === `http://127.0.0.1:${port}`)) {
    throw new Error("API_TEST_ENVIRONMENT_INVALID");
  }
  return {
    ...config,
    distDir: process.env.JOPOI_E2E_BUNDLER === "webpack" ? ".cache/e2e/next" : process.env.APP_URL === `http://127.0.0.1:${marker.httpPort}` ? ".cache/api-tests/next" : ".cache/api-tests/secondary-next",
    // Keep the local browser harness usable on memory-constrained Windows hosts.
    // The normal production configuration above does not enable experimental flags.
    experimental: { webpackMemoryOptimizations: true },
    ...(process.env.JOPOI_E2E_BUNDLER === "webpack" ? {
      webpack(configuration: Record<string, unknown>) {
        const watch = configuration.watchOptions;
        if (watch === null || typeof watch !== "object") throw new Error("TEST_WEBPACK_WATCH_OPTIONS_UNEXPECTED");
        const ignored = Reflect.get(watch, "ignored");
        if (!(ignored instanceof RegExp)) throw new Error("TEST_WEBPACK_IGNORES_UNEXPECTED");
        const workspace = resolve(".").split(/[\\/]/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\\\/]");
        // Conservá las exclusiones de Next y no vigiles C:\\ por dependencias faltantes fuera del workspace aislado.
        return { ...configuration, watchOptions: { ...watch, ignored: new RegExp(`(?:${ignored.source})|^(?!${workspace}(?:[\\\\/]|$))`, "i") } };
      },
    } : {}),
    typescript: { tsconfigPath: "tsconfig.api.json" },
    turbopack: { resolveAlias: {
      "@/server/runtime/clock": "./tests/support/clock.ts",
      "@/server/runtime/network": "./tests/support/network.ts",
      "@/server/runtime/client-identity": "./tests/support/client-identity.ts",
      "@/server/runtime/deadlines": "./tests/support/deadlines.ts",
      "@/server/runtime/jitter": "./tests/support/jitter.ts",
    } },
  };
}

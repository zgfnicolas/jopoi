import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

export default function configuration(phase: string): NextConfig {
  const config: NextConfig = { serverExternalPackages: ["@hiero-ledger/sdk"],
    async headers() { return [{ source: "/api/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }]; },
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
    || process.env.APP_URL !== `http://127.0.0.1:${marker.httpPort}`) {
    throw new Error("API_TEST_ENVIRONMENT_INVALID");
  }
  return {
    ...config,
    distDir: process.env.JOPOI_E2E_BUNDLER === "webpack" ? ".cache/e2e/next" : ".cache/api-tests/next",
    // Keep the local browser harness usable on memory-constrained Windows hosts.
    // The normal production configuration above does not enable experimental flags.
    experimental: { webpackMemoryOptimizations: true },
    typescript: { tsconfigPath: "tsconfig.api.json" },
    turbopack: { resolveAlias: {
      "@/server/runtime/clock": "./tests/support/clock.ts",
      "@/server/runtime/network": "./tests/support/network.ts",
    } },
  };
}

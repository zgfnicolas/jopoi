import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Deterministic jitter for HTTP tests: 0 unless `jitter.json` sets `{ "sample": n }`. */
export function jitterSample(): number {
  const directory = process.env.JOPOI_API_TEST_DIRECTORY;
  if (!directory || process.env.VERCEL) throw new Error("API_TEST_JITTER_FORBIDDEN");
  const file = resolve(directory, "jitter.json");
  for (let attempt = 0; attempt <= 10; attempt++) {
    try {
      if (!existsSync(file)) return 0;
      const value: unknown = JSON.parse(readFileSync(file, "utf8"));
      const sample = value !== null && typeof value === "object" && "sample" in value ? value.sample : 0;
      return typeof sample === "number" && Number.isFinite(sample) ? sample : 0;
    } catch {
      if (attempt === 10) return 0;
    }
  }
  return 0;
}

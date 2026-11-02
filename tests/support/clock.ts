import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function now(): Date {
  const directory = process.env.JOPOI_API_TEST_DIRECTORY;
  if (!directory || process.env.VERCEL) throw new Error("API_TEST_CLOCK_FORBIDDEN");
  const file = resolve(directory, "clock.json");
  for (let attempt = 0; ; attempt++) {
    try { return new Date(JSON.parse(readFileSync(file, "utf8"))); }
    catch (error) { if (attempt >= 20) throw error; }
  }
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function now(): Date {
  const directory = process.env.JOPOI_API_TEST_DIRECTORY;
  if (!directory || process.env.VERCEL) throw new Error("API_TEST_CLOCK_FORBIDDEN");
  return new Date(JSON.parse(readFileSync(resolve(directory, "clock.json"), "utf8")));
}

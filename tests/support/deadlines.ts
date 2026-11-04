import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_DEADLINE_POLICY, type DeadlinePolicy } from "../../src/server/deadlines";

export function getDeadlinePolicy(): Readonly<DeadlinePolicy> {
  const directory = process.env.JOPOI_API_TEST_DIRECTORY;
  if (!directory || process.env.VERCEL) return DEFAULT_DEADLINE_POLICY;
  const file = resolve(directory, "deadlines.json");
  for (let attempt = 0; attempt <= 10; attempt++) {
    try {
      if (!existsSync(file)) return DEFAULT_DEADLINE_POLICY;
      const overrides = JSON.parse(readFileSync(file, "utf8")) as Partial<DeadlinePolicy>;
      return { ...DEFAULT_DEADLINE_POLICY, ...overrides };
    } catch {
      if (attempt === 10) return DEFAULT_DEADLINE_POLICY;
    }
  }
  return DEFAULT_DEADLINE_POLICY;
}

import { readFile } from "node:fs/promises";
import { test as base, expect } from "@playwright/test";
import { TestRuntime } from "../../support/runtime";
import type { TestResources } from "../../support/runtime-provision";
import { Journey } from "./journey";

export const test = base.extend<{ journey: Journey }, { runtime: TestRuntime }>({
  runtime: [async ({}, use) => {
    const file = process.env.JOPOI_E2E_RESOURCES_FILE;
    if (!file) throw new Error("BLOCKED_E2E_RESOURCES_MISSING");
    const runtime = new TestRuntime(JSON.parse(await readFile(file, "utf8")) as TestResources, "webpack");
    try { await use(runtime); } finally { await runtime.close(); }
  }, { scope: "worker" }],
  page: [async ({ page, runtime }, use, info) => {
    const initialTime = new Date();
    await runtime.reset(initialTime.toISOString());
    // Preserve the native browser clock outside the explicit expiry scenario.
    if (info.title.includes("E2E-11")) await page.clock.install({ time: initialTime });
    await use(page);
  }, { scope: "test", timeout: 180000 }],
  journey: async ({ page, runtime }, use) => { await use(new Journey(page, runtime.origin)); },
});
export { expect };

import { test as base, expect } from "@playwright/test";
import { TestRuntime } from "../../support/runtime";
import { readOwnedResources } from "../../support/owned-resources";
import { Journey } from "./journey";

export const test = base.extend<{ journey: Journey }, { runtime: TestRuntime }>({
  runtime: [async ({}, use) => {
    const file = process.env.JOPOI_E2E_RESOURCES_FILE;
    if (!file) throw new Error("BLOCKED_E2E_RESOURCES_MISSING");
    const runtime = new TestRuntime(await readOwnedResources(file), "webpack");
    try { await use(runtime); } finally { await runtime.close(); }
  }, { scope: "worker" }],
  page: [async ({ context, runtime }, use, info) => {
    const initialTime = new Date();
    await runtime.reset(initialTime.toISOString());
    const page = await context.newPage();
    // Preserve the native browser clock outside the explicit expiry scenario.
    if (info.title.includes("E2E-11")) await page.clock.install({ time: initialTime });
    try { await use(page); } finally { await page.close(); }
  }, { scope: "test", timeout: 180000 }],
  journey: async ({ page, runtime }, use) => { await use(new Journey(page, runtime.origin)); },
});
export { expect };

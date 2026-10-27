import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120000,
  expect: { timeout: 20000 },
  globalSetup: "./tests/e2e/support/setup.ts",
  outputDir: ".cache/e2e/artifacts",
  reporter: [["list"], ["html", { outputFolder: ".cache/e2e/html", open: "never" }], ["./tests/e2e/support/reporter.ts"]],
  use: {
    locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires",
    screenshot: "only-on-failure", trace: "retain-on-failure", actionTimeout: 20000, navigationTimeout: 45000,
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } } },
  ],
});

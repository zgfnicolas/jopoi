import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/api/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    maxWorkers: 1,
    retry: 0,
    testTimeout: 90000,
    hookTimeout: 120000,
    globalSetup: ["./tests/support/global-setup.ts"],
    reporters: ["default", "./tests/support/reporter.ts"],
  },
});

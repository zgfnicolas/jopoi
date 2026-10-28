import { writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { provisionRuntime } from "../../support/runtime-provision";
import { TestRuntime } from "../../support/runtime";

export default async function setup() {
  const runtime = await provisionRuntime();
  const warmup = new TestRuntime(runtime.resources, "webpack");
  try { await warmup.start(); }
  catch (error) { await runtime.close(); throw error; }
  finally { await warmup.close(); }
  const file = resolve(runtime.resources.directory, "playwright-resources.json");
  try { await writeFile(file, JSON.stringify(runtime.resources), { mode: 0o600 }); }
  catch (error) { await runtime.close(); throw error; }
  process.env.JOPOI_E2E_RESOURCES_FILE = file;
  return async () => {
    try { await runtime.close(); } finally { await unlink(file); }
  };
}

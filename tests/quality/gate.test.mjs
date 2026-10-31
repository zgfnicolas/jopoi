import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const npmCli = process.env.npm_execpath;
assert.equal(typeof npmCli, "string", "Usá npm run test:quality.");

for (const [control, source, directory = "tests/quality"] of [
  ["typecheck", 'export const s22Probe: number = "invalid";'],
  ["lint", "debugger; export {};"],
  ["typecheck:report", "const values: readonly number[] = []; export const s22Probe: number = values[0];", "src/server"],
  ["typecheck:report", "const values: readonly number[] = []; export const s22Probe: number = values[0];", "src/frontend"],
]) {
  test(`S22-31: una infracción real de ${control} en ${directory} detiene el gate antes de las regresiones`, {
    timeout: 120000,
  }, async (context) => {
    // Inyectá un archivo propio nuevo: también demostramos que el gate no omite código sin trackear.
    const probe = resolve(root, directory, `probe-${randomUUID()}.ts`);
    await writeFile(probe, source, { flag: "wx" });
    context.after(() => unlink(probe));
    const child = spawn(process.execPath, [npmCli, "run", "quality:check"], {
      cwd: root,
      windowsHide: true,
      signal: AbortSignal.timeout(100000),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    const [code] = await once(child, "close");
    assert.notEqual(code, 0, output);
    assert.match(output, new RegExp(`QUALITY_GATE_FAILED:${control}`), output);
    assert.doesNotMatch(output, /QUALITY_GATE_RUN:test:quality|QUALITY_GATE_RUN:test:api/);
  });
}

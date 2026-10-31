import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const npmCli = process.env.npm_execpath;
assert.equal(typeof npmCli, "string", "Usá npm run test:quality.");

test("S22-10: las variantes heredan las tres opciones estrictas y el perfil principal incluye todas las áreas propias", () => {
  for (const profile of ["tsconfig.json", "tsconfig.strict.json", "tsconfig.api.json"]) {
    const result = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", profile, "--showConfig"], {
      cwd: root, encoding: "utf8", windowsHide: true, timeout: 60000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const config = JSON.parse(result.stdout);
    for (const option of ["strict", "noUncheckedIndexedAccess", "exactOptionalPropertyTypes"]) assert.equal(config.compilerOptions[option], true, `${profile}: ${option}`);
    if (profile === "tsconfig.json") {
      for (const file of ["src/domain/operations.ts", "scripts/quality.ts", "tests/cli/seguridad.test.ts", "prisma.config.ts"]) {
        assert.ok(config.files.some(candidate => candidate.replaceAll("\\", "/").replace(/^\.\//, "") === file), `${profile}: ${file}`);
      }
    }
  }
});

for (const [control, source, directory = "tests/quality", suffix = ".ts"] of [
  ["typecheck", 'export const s22Probe: number = "invalid";'],
  ["lint", "debugger; export {};"],
  ["typecheck", "const values: readonly number[] = []; export const s22Probe: number = values[0];", "src/server"],
  ["typecheck", "export const s22Probe: { label?: string } = { label: undefined };", "src/frontend"],
  ["typecheck", "const values: readonly number[] = []; export const s22Probe: number = values[0];", "scripts"],
  ["typecheck", "export const s22Probe: { label?: string } = { label: undefined };"],
  ["typecheck", "const values: readonly number[] = []; export const s22Probe: number = values[0];", ".", ".config.ts"],
]) {
  test(`S22-31: una infracción real de ${control} en ${directory} detiene el gate antes de las regresiones`, {
    timeout: 120000,
  }, async (context) => {
    // Inyectá un archivo propio nuevo: también demostramos que el gate no omite código sin trackear.
    const probe = resolve(root, directory, `probe-${randomUUID()}${suffix}`);
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

test("S22-31: el informe estricto también falla ante una regresión en scripts", { timeout: 120000 }, async () => {
  const probe = resolve(root, "scripts", `probe-${randomUUID()}.ts`);
  const report = () => spawnSync(process.execPath, ["scripts/strict-report.mjs"], {
    cwd: root, encoding: "utf8", windowsHide: true, timeout: 65000,
  });
  await writeFile(probe, "const values: readonly number[] = []; export const s22Probe: number = values[0];", { flag: "wx" });
  try {
    const result = report();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const summary = JSON.parse(await readFile(resolve(root, ".cache/quality/strict-report.json"), "utf8"));
    assert.equal(summary.mode, "enforced-global-strict");
    assert.ok(summary.diagnostics.some(diagnostic => diagnostic.file.endsWith(probe.split(/[\\/]/).at(-1))));
  } finally {
    await unlink(probe);
    // Restituí el informe real: la prueba negativa no es la evidencia del código entregado.
    const restored = report();
    assert.equal(restored.error, undefined);
    assert.equal(restored.status, 0, restored.stdout + restored.stderr);
  }
});

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapshot = process.argv.slice(2);
if (snapshot.length > 1 || (snapshot.length === 1 && snapshot[0] !== "--snapshot")) {
  throw new Error("STRICT_REPORT_INVALID_ARGUMENTS");
}
const result = spawnSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", "tsconfig.strict.json", "--pretty", "false"],
  {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 60000,
    maxBuffer: 16 * 1024 * 1024,
  },
);
if (result.error || result.signal || result.status === null) throw new Error("STRICT_REPORT_COMPILER_UNAVAILABLE");
const output = result.stdout + result.stderr;
const diagnostics = [...output.matchAll(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm)].map((match) => ({
  file: match[1].replaceAll("\\", "/"),
  line: Number(match[2]),
  column: Number(match[3]),
  code: match[4],
  message: match[5].trim(),
}));
// Tolerá solamente diagnósticos identificables del perfil futuro, nunca una falla de la herramienta.
const compilerErrors = [...output.matchAll(/(?:^|\n).*?error TS\d+:/g)].length;
if (
  (result.status !== 0 && result.status !== 1 && result.status !== 2) ||
  compilerErrors !== diagnostics.length ||
  (result.status !== 0 && diagnostics.length === 0)
) {
  throw new Error("STRICT_REPORT_UNRECOGNIZED_COMPILER_FAILURE");
}
const compiler = JSON.parse(await readFile(resolve(root, "node_modules/typescript/package.json"), "utf8"));
const hash = createHash("sha256");
for (const name of ["tsconfig.json", "tsconfig.strict.json"]) hash.update(await readFile(resolve(root, name)));
const areas = new Map();
const files = new Map();
for (const diagnostic of diagnostics) {
  const area = diagnostic.file.startsWith("src/")
    ? diagnostic.file.split("/").slice(0, 2).join("/")
    : diagnostic.file.split("/")[0];
  areas.set(area, (areas.get(area) ?? 0) + 1);
  files.set(diagnostic.file, (files.get(diagnostic.file) ?? 0) + 1);
}
const summary = {
  generatedAt: new Date().toISOString(),
  compiler: compiler.version,
  configSha256: hash.digest("hex"),
  mode: "temporary-diagnostic-until-ticket-07",
  compilerExitCode: result.status,
  total: diagnostics.length,
  areas: Object.fromEntries([...areas].sort()),
  diagnostics,
};
const markdown = `# S22-02 · Diagnóstico del perfil estricto completo

Informe temporal: **${diagnostics.length} diagnósticos pendientes** con TypeScript ${compiler.version}. No acredita aceptación de S22-10. El ticket 07 debe exigir cero diagnósticos y retirar esta tolerancia.

Configuración SHA-256: \`${summary.configSha256}\`. Se heredan íntegramente include/exclude del perfil vigente; se agregan noUncheckedIndexedAccess y exactOptionalPropertyTypes sin quitar strict.

## Por área

| Área | Diagnósticos |
| --- | ---: |
${[...areas]
  .sort()
  .map(([area, count]) => `| ${area} | ${count} |`)
  .join("\n")}

## Por archivo

| Archivo | Diagnósticos |
| --- | ---: |
${[...files]
  .sort()
  .map(([file, count]) => `| ${file} | ${count} |`)
  .join("\n")}

Reproducí el detalle con \`npm run typecheck:strict\` (devuelve error mientras haya pendientes) o \`npm run typecheck:report\` (genera JSON, texto completo y resumen en .cache/quality). Para actualizar esta instantánea ejecutá \`npm run typecheck:report -- --snapshot\` y revisá el diff. El informe no agrega casts, supresiones ni exclusiones.
`;
const directory = resolve(root, ".cache/quality");
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, "strict-report.json"), JSON.stringify(summary, null, 2) + "\n");
await writeFile(resolve(directory, "strict-report.txt"), output);
await writeFile(resolve(directory, "strict-report.md"), markdown);
if (snapshot[0] === "--snapshot") await writeFile(resolve(root, "docs/s22-02-diagnosticos-estrictos.md"), markdown);
console.log(
  `DIAGNÓSTICO TEMPORAL: ${diagnostics.length} pendientes. Detalle: .cache/quality/strict-report.json. Obligatorio sin tolerancia en ticket 07.`,
);

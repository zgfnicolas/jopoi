import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ENVIRONMENT_VARIABLES } from "../src/server/config/environment";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("QUALITY_GATE_REQUIRES_NPM_RUN");

// Sellá las capacidades de la aplicación: un gate local tampoco debe heredar conexiones habituales.
const environment = {
  ...process.env,
  ...Object.fromEntries(ENVIRONMENT_VARIABLES.map((name) => [name, ""])),
  APP_URL: "http://127.0.0.1:3000",
  NEXT_TELEMETRY_DISABLED: "1",
  VERCEL: "",
  NODE_OPTIONS: "",
};
const checks = [
  "db:generate",
  "db:validate",
  "typecheck",
  "lint",
  "typecheck:report",
  "test:quality",
  "test:security",
  "test:domain",
  "test:cli",
  "test:ui:tokens",
  "test:api",
  "build",
];

for (const check of checks) {
  console.log(`QUALITY_GATE_RUN:${check}`);
  const code = await new Promise<number>((done, reject) => {
    const child = spawn(process.execPath, [npmCli, "run", check], {
      cwd: root,
      env: environment,
      stdio: "inherit",
      windowsHide: true,
      shell: false,
    });
    child.once("error", reject);
    child.once("close", (code) => done(code ?? 1));
  });
  if (code !== 0) {
    console.error(`QUALITY_GATE_FAILED:${check}`);
    process.exitCode = code;
    break;
  }
}

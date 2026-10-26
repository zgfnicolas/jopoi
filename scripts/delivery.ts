import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CliEnvironmentError, environmentOption, loadCliEnvironment } from "../src/server/config/cli-environment";
import { deliveryCheck, type DeliveryProfile } from "../src/server/delivery/preflight";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
async function child(relative: string, args: string[]): Promise<number> {
  return new Promise((done, reject) => {
    const processChild = spawn(process.execPath, [resolve(ROOT, relative), ...args], { cwd: ROOT, env: { ...process.env, NODE_ENV: "production" }, stdio: "inherit", shell: false, windowsHide: true });
    processChild.once("error", reject); processChild.once("close", code => done(code ?? 1));
  });
}
async function main() {
  const { args, file } = environmentOption(process.argv.slice(2));
  const action = args[0];
  if (!["check", "build"].includes(action)) throw new CliEnvironmentError("INVALID_CLI_ARGUMENTS");
  if (args.length === 2 && args[1] === "--help") {
    console.log("delivery:check -- [--profile local|candidate] [--env-file ARCHIVO]\ndelivery:build -- --env-file ARCHIVO\nCheck es offline: solo archivos, formatos y clave DER; no demuestra disponibilidad.\nBuild exige perfil candidato válido y ejecuta generate + next build, sin migrar ni desplegar.\nAyuda sin entorno ni conexiones. Código 0: válido sin comprobar red; 1: bloqueado/fallo; 2: argumentos inválidos."); return;
  }
  let profile: DeliveryProfile = action === "build" ? "candidate" : "local";
  if (args.length !== 1) {
    if (action !== "check" || args.length !== 3 || args[1] !== "--profile" || !["local", "candidate"].includes(args[2])) throw new CliEnvironmentError("INVALID_CLI_ARGUMENTS");
    profile = args[2] as DeliveryProfile;
  }
  if (profile === "candidate" && file === undefined) throw new CliEnvironmentError("INVALID_CLI_ARGUMENTS");
  loadCliEnvironment(ROOT, file);
  const result = await deliveryCheck(ROOT, profile, process.env);
  console.log(JSON.stringify(result));
  if (!result.ok) { process.exitCode = 1; return; }
  if (action === "check") return;
  const generate = await child("node_modules/prisma/build/index.js", ["generate"]);
  process.exitCode = generate === 0 ? await child("node_modules/next/dist/bin/next", ["build"]) : generate;
}
main().catch(error => {
  console.error(error instanceof CliEnvironmentError ? error.code : "DELIVERY_PREPARATION_FAILED");
  process.exitCode = error instanceof CliEnvironmentError && error.code === "INVALID_CLI_ARGUMENTS" ? 2 : 1;
});

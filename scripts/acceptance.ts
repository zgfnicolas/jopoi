import { mkdir, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { environmentOption, loadCliEnvironment, CliEnvironmentError } from "../src/server/config/cli-environment";
import { deliveryCheck } from "../src/server/delivery/preflight";
import { acceptanceReport, readProof } from "./lib/acceptance-report";
import { evidenceRevision } from "./lib/evidence";

async function main() {
  const { args, file, format } = environmentOption(process.argv.slice(2));
  const action = args.shift();
  if (!["check", "live"].includes(action ?? "")) throw new CliEnvironmentError("INVALID_CLI_ARGUMENTS");
  if (args.length === 1 && args[0] === "--help") {
    console.log("acceptance:check -- [--env-file ARCHIVO (o --vercel-env-file ARCHIVO)] [--evidence ARCHIVO] [--journal ARCHIVO]\nacceptance:live -- --run --env-file ARCHIVO (o --vercel-env-file ARCHIVO) --evidence ARCHIVO --journal .cache/acceptance/ARCHIVO.json\nCheck solo lee archivos: no conecta SQL, inicia navegador ni contacta proveedores.\nLive opera un recorrido sintético en el candidato explícito; no crea servicios, topics o despliegues.\nReusar journal solo consulta el recorrido conocido; no repite escrituras. Nunca guarda cookies o claves.\nCódigos: 0 aprobado, 1 fallido/bloqueado, 2 argumentos inválidos. Ayuda sin cargar entorno."); return;
  }
  let run = false, evidence: string | undefined, journal: string | undefined;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--run" && !run) { run = true; continue; }
    if (!["--evidence", "--journal"].includes(args[index]) || !args[index + 1] || args[index + 1].startsWith("--")) throw new CliEnvironmentError("INVALID_CLI_ARGUMENTS");
    if (args[index] === "--evidence" && !evidence) evidence = args[++index];
    else if (args[index] === "--journal" && !journal) journal = args[++index];
    else throw new CliEnvironmentError("INVALID_CLI_ARGUMENTS");
  }
  if (action === "check" && run || action === "live" && (!run || !file || !evidence || !journal)) throw new CliEnvironmentError("INVALID_CLI_ARGUMENTS");
  const root = resolve(".cache/acceptance");
  if (journal && !resolve(journal).startsWith(root + sep)) throw new CliEnvironmentError("INVALID_CLI_ARGUMENTS");
  let origin: string | undefined;
  let configured = false;
  if (file) {
    loadCliEnvironment(process.cwd(), file, format);
    const candidate = await deliveryCheck(process.cwd(), "candidate", process.env);
    configured = candidate.ok;
    if (configured) origin = process.env.APP_URL;
  }
  await mkdir(root, { recursive: true });
  if (action === "live") {
    const source = evidenceRevision();
    if (!configured || !origin || source.dirty || process.env.JOPOI_API_TEST_DIRECTORY || !readProof(evidence, origin, source.revision)) {
      console.log(JSON.stringify({ status: "BLOQUEADO", code: "LIVE_CANDIDATE_OR_PROVIDER_EVIDENCE_MISSING" })); process.exitCode = 1; return;
    }
    await mkdir(resolve(journal!, ".."), { recursive: true });
    const { runLive } = await import("./lib/live-acceptance");
    const result = await runLive(origin, process.env.HEDERA_TOPIC_ID!, process.env.HEDERA_OPERATOR_ID!, resolve(journal!));
    console.log(JSON.stringify({ status: result.status, traceId: result.traceId, events: result.events.length, recovery: result.recovery }));
    process.exitCode = result.status === "APROBADO" ? 0 : 1;
    return;
  }
  const report = acceptanceReport(origin, evidence, journal, configured ? process.env.HEDERA_TOPIC_ID : undefined, configured ? process.env.HEDERA_OPERATOR_ID : undefined);
  await writeFile(resolve(root, "report.json"), JSON.stringify(report, null, 2));
  await writeFile(resolve(root, "report.md"), "# Aceptación S18\n\nEstado global: **" + report.status + "**\n\n" + report.note + "\n\n| Caso | Local | Aceptación | Recuperación pendiente |\n| --- | --- | --- | --- |\n" +
    report.cases.map(item => `| ${item.id} | ${item.local} | ${item.result} | ${item.recovery ?? "—"} |`).join("\n") +
    "\n\n| Criterio del alcance | Resultado | Casos |\n| --- | --- | --- |\n" + report.criteria.map(item => `| ${item.criterion} | ${item.result} | ${item.cases.join(", ")} |`).join("\n") + "\n");
  console.log(JSON.stringify({ status: report.status, api: report.api, configuredCandidate: configured, dirty: report.dirty,
    cases: report.cases.map(item => ({ id: item.id, result: item.result })), report: ".cache/acceptance/report.md" }));
  process.exitCode = report.status === "APROBADO" ? 0 : 1;
}
main().catch(error => {
  console.error(error instanceof CliEnvironmentError ? error.code : "ACCEPTANCE_EVIDENCE_UNAVAILABLE");
  process.exitCode = error instanceof CliEnvironmentError && error.code === "INVALID_CLI_ARGUMENTS" ? 2 : 1;
});

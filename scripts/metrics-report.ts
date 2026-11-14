import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CliEnvironmentError, environmentOption, loadCliEnvironment } from "../src/server/config/cli-environment";
import { exportMetricsReport } from "../src/server/metrics";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const { args, file, format } = environmentOption(process.argv.slice(2));
  if (args.length === 1 && args[0] === "--help") {
    console.log(
      "metrics:report -- [--env-file ARCHIVO (o --vercel-env-file ARCHIVO)]\nEmite el reporte versionado (schemaVersion: 1) con métricas RED, USE, negocio y SLOs.\nNo expone UUIDs, credenciales, emails ni URLs libres.",
    );
    return;
  }
  if (file !== undefined) {
    loadCliEnvironment(ROOT, file, format);
  }
  const report = exportMetricsReport();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof CliEnvironmentError ? error.code : "METRICS_REPORT_UNAVAILABLE");
  process.exitCode = error instanceof CliEnvironmentError && error.code === "INVALID_CLI_ARGUMENTS" ? 2 : 1;
});

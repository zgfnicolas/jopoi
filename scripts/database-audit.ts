import { environmentOption, loadCliEnvironment, CliEnvironmentError } from "../src/server/config/cli-environment";
import { createConfigReader } from "../src/server/config/environment";
import { auditDatabase } from "../src/server/database/audit";

async function main() {
  const { args, file, format } = environmentOption(process.argv.slice(2));
  if (args.length===1 && args[0]==="--help") {
    console.log("db:audit -- --env-file ARCHIVO (o --vercel-env-file ARCHIVO)\nSolo lectura: permisos, restricciones, triggers y TLS de la conexión de aplicación. No migra ni cambia permisos. Códigos: 0 comprobaciones aprobadas, 1 fallo/pendiente, 2 argumentos inválidos.");
    return;
  }
  if (args.length || !file) throw new CliEnvironmentError("INVALID_CLI_ARGUMENTS");
  loadCliEnvironment(process.cwd(), file, format);
  const config = createConfigReader(process.env).database();
  if (config.status!=="configured") throw new Error("DATABASE_UNAVAILABLE");
  const report = await auditDatabase(config.config.url);
  console.log(JSON.stringify(report));
  process.exitCode = report.passed ? 0 : 1;
}
main().catch(error=> { console.error(error instanceof CliEnvironmentError ? error.code : "DATABASE_AUDIT_UNAVAILABLE");
  process.exitCode=error instanceof CliEnvironmentError && error.code==="INVALID_CLI_ARGUMENTS" ? 2 : 1; });

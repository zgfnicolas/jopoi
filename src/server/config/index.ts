import "server-only";

import { ApplicationError } from "../api-errors";
import { createConfigReader, type ConfigurationResult } from "./environment";

export { describeConfiguration } from "./environment";

/** Llamar en servidor; no lee ni valida el entorno durante la importación. */
export function getServerConfig() {
  return createConfigReader(process.env);
}

/** Solo exige configuración; no demuestra conectividad ni persistencia. */
export function requireConfiguration<T>(result: ConfigurationResult<T>): T {
  if (result.status === "configured") return result.config;

  const code = result.capability === "database" || result.capability === "migrations"
    ? "DATABASE_UNAVAILABLE"
    : "CONFIGURATION_UNAVAILABLE";
  throw new ApplicationError(code);
}

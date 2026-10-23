import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ApplicationError } from "../src/server/application-error";
import { loadCliEnvironment } from "../src/server/config/cli-environment";
import { createConfigReader } from "../src/server/config/environment";
import { ContactExportCleanupError, exportContacts } from "../src/server/contacts/export";
import { mapDatabaseError } from "../src/server/database/errors";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--help" && arg !== "--local-only")) {
    console.error("INVALID_EXPORT_ARGUMENTS");
    process.exitCode = 2;
    return;
  }
  if (args.includes("--help")) {
    console.log([
      "Uso: npm run contacts:export -- [--local-only]",
      "Exporta contactos vigentes al corte inicial a un archivo nuevo en .cache/exports/.",
      "Excel: UTF-8 con BOM, separador ; y filas CRLF. No imprime datos personales.",
      "Requiere DATABASE_URL privada. No necesita sesión de demo, cron ni Hedera.",
      "--local-only limita el destino a 127.0.0.1:54321/jopoi.",
      "--help muestra esta ayuda sin cargar entorno ni conectar a SQL.",
    ].join("\n"));
    return;
  }
  loadCliEnvironment(ROOT);
  const database = createConfigReader(process.env).database();
  if (database.status !== "configured") throw new ApplicationError("DATABASE_UNAVAILABLE");
  if (args.includes("--local-only")) {
    const target = new URL(database.config.url);
    if (target.hostname !== "127.0.0.1" || target.port !== "54321" || target.pathname !== "/jopoi") {
      throw new ApplicationError("DATABASE_UNAVAILABLE");
    }
  }
  const { createDatabaseClient } = await import("../src/server/database/client");
  const client = createDatabaseClient(database.config.url);
  let result: { count: number; file: string };
  try {
    result = await exportContacts(client, ROOT);
  } finally {
    await client.$disconnect();
  }
  console.log(JSON.stringify({ code: "CONTACTS_EXPORTED", count: result.count, file: result.file }));
}

main().catch((error: unknown) => {
  const mapped = mapDatabaseError(error);
  console.error(error instanceof ContactExportCleanupError
    ? "CONTACT_EXPORT_CLEANUP_REQUIRED"
    : mapped instanceof ApplicationError ? mapped.code : "INTERNAL_ERROR");
  process.exitCode = 1;
});

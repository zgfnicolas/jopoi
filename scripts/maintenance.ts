import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("maintenance --run [--local-only]\nEjecuta limpieza y recuperación acotadas; modifica SQL y puede enviar a Hedera testnet.\n--local-only exige PostgreSQL 127.0.0.1:54321/jopoi; no desactiva Hedera.");
    return;
  }
  if (!args.includes("--run") || args.some(a => !["--run", "--local-only"].includes(a)) || new Set(args).size !== args.length) throw new Error("INVALID_MAINTENANCE_ARGUMENTS");
  const { loadCliEnvironment } = await import("../src/server/config/cli-environment");
  loadCliEnvironment(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  const { createConfigReader } = await import("../src/server/config/environment");
  const config = createConfigReader(process.env).database();
  if (config.status !== "configured") throw new Error("DATABASE_UNAVAILABLE");
  const url = new URL(config.config.url);
  if (args.includes("--local-only") && (url.hostname !== "127.0.0.1" || url.port !== "54321" || url.pathname !== "/jopoi")) throw new Error("LOCAL_DATABASE_REQUIRED");
  const { createDatabaseClient } = await import("../src/server/database/client");
  const { mapDatabaseError } = await import("../src/server/database/errors");
  const { createHcsProvider } = await import("../src/server/hedera/provider");
  const { runMaintenance } = await import("../src/server/hedera/maintenance-core");
  const client = createDatabaseClient(config.config.url);
  try {
    const result = await runMaintenance({ environment: process.env, provider: createHcsProvider(process.env), now: () => new Date(),
      transaction: async work => {
        try { return await client.$transaction(work, { isolationLevel: "Serializable", maxWait: 2000, timeout: 5000 }); }
        catch (error) { throw mapDatabaseError(error); }
      },
    }, true);
    console.log(JSON.stringify(result));
  } finally { await client.$disconnect(); }
}
main().catch(() => { console.error("MAINTENANCE_FAILED"); process.exitCode = 1; });

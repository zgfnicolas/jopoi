import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ApplicationError } from "../src/server/application-error";
import { loadCliEnvironment } from "../src/server/config/cli-environment";
import { createConfigReader } from "../src/server/config/environment";
import { mapDatabaseError } from "../src/server/database/errors";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function requireLocalTarget(url: string): void {
  if (!process.argv.includes("--local-only")) return;
  const target = new URL(url);
  if (target.hostname !== "127.0.0.1" || target.port !== "54321" || target.pathname !== "/jopoi") {
    throw new ApplicationError("DATABASE_UNAVAILABLE");
  }
}

async function main(): Promise<void> {
  loadCliEnvironment(ROOT);
  const command = process.argv[2];
  const config = createConfigReader(process.env);
  if (command === "check") {
    const database = config.database();
    if (database.status !== "configured") throw new ApplicationError("DATABASE_UNAVAILABLE");
    requireLocalTarget(database.config.url);
    const { createDatabaseClient } = await import("../src/server/database/client");
    const client = createDatabaseClient(database.config.url);
    try {
      await client.$queryRaw`SELECT 1`;
      console.log("DATABASE_AVAILABLE: conexión SQL comprobada en esta ejecución.");
    } finally {
      await client.$disconnect();
    }
    return;
  }
  if (command !== "migrate" && command !== "status") throw new Error("INVALID_DATABASE_COMMAND");
  const migrations = config.migrations();
  if (migrations.status !== "configured") throw new ApplicationError("DATABASE_UNAVAILABLE");
  requireLocalTarget(migrations.config.url);
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    const child = spawn(process.execPath, [
      resolve(ROOT, "node_modules/prisma/build/index.js"), "migrate", command === "migrate" ? "deploy" : "status",
    ], { cwd: ROOT, shell: false, windowsHide: true, stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("close", (code) => resolveExit(code ?? 1));
  });
  process.exitCode = exitCode;
}

main().catch((error: unknown) => {
  const mapped = mapDatabaseError(error);
  console.error(mapped instanceof ApplicationError ? mapped.code : "INTERNAL_ERROR");
  process.exitCode = 1;
});

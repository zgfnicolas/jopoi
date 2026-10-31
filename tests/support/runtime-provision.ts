import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve, sep } from "node:path";

import { child, completed } from "./process";
import { ledger } from "./ledger";
import { provisionApplicationRole } from "./restricted-role";

export interface TestResources { directory: string; pgPort: number; httpPort: number; secondaryHttpPort: number; databaseUrl: string; applicationUrl: string; socket: string; token: string; pgBin: string }


async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TEST_PORT_UNAVAILABLE");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

export async function provisionRuntime() {
  const root = resolve(".cache", "api-tests");
  await mkdir(root, { recursive: true });
  const lockPath = resolve(root, "active.lock");
  const lock = await open(lockPath, "wx", 0o600).catch(() => { throw new Error("BLOCKED_API_TEST_ALREADY_RUNNING: revisar .cache/api-tests/active.lock"); });
  await lock.writeFile(JSON.stringify({ pid: process.pid }));
  try {
    const runtime = await initialize();
    return { resources: runtime.resources, close: async () => {
      try { await runtime.close(); } finally { await lock.close(); await unlink(lockPath); }
    } };
  } catch (error) {
    await lock.close();
    await unlink(lockPath);
    console.error("BLOCKED_API_TEST_SETUP: revisar logs privados de .cache/api-tests");
    throw error;
  }
}

async function initialize() {
  const directory = resolve(".cache", "api-tests", randomUUID());
  await mkdir(directory, { recursive: true });
  const token = randomBytes(32).toString("hex");
  const [pgPort, httpPort, secondaryHttpPort] = [await freePort(), await freePort(), await freePort()];
  const candidates = (await readdir(resolve(".tools", "postgresql"))).filter(name => /^17\.[\d.-]+$/.test(name)).sort();
  const candidate = candidates.at(-1);
  if (!candidate) throw new Error("BLOCKED_POSTGRES_BINARIES_MISSING");
  const pgBin = resolve(".tools", "postgresql", candidate, "pgsql", "bin");
  const password = randomBytes(32).toString("hex");
  const passwordFile = resolve(directory, "pg-password");
  await writeFile(passwordFile, password, { mode: 0o600 });
  const data = resolve(directory, "data");
  const env = { ...process.env, PGPASSWORD: password, PGCONNECT_TIMEOUT: "3" };
  const pg = (name: string, args: string[]) => completed(child(resolve(pgBin, `${name}.exe`), args, env, name === "pg_ctl" ? undefined : resolve(directory, "postgres-setup.log")));
  let started = false;
  const originalNextEnv = await readFile("next-env.d.ts", "utf8");
  try {
    await pg("initdb", ["-D", data, "-U", "s17", "--pwfile", passwordFile, "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C"]);
    await pg("pg_ctl", ["-D", data, "-l", resolve(directory, "postgres.log"), "-o", `-h 127.0.0.1 -p ${pgPort}`, "-w", "start"]);
    started = true;
    await pg("createdb", ["-h", "127.0.0.1", "-p", String(pgPort), "-U", "s17", "s17_api"]);
    const databaseUrl = `postgresql://s17:${password}@127.0.0.1:${pgPort}/s17_api`;
    const socket = process.platform === "win32" ? `\\\\.\\pipe\\jopoi-s17-${token}` : resolve(directory, "ledger.sock");
    await writeFile(resolve(directory, "owner.json"), JSON.stringify({ token, pgPort, httpPort, secondaryHttpPort }), { mode: 0o600 });
    await writeFile(resolve(directory, "clock.json"), JSON.stringify("2026-01-01T12:00:00.000Z"));
    // Seal all application values so Next/Prisma cannot load real .env.local credentials.
    const { sealedEnvironment } = await import("./test-environment");
    const resources: TestResources = { directory, pgPort, httpPort, secondaryHttpPort, databaseUrl, applicationUrl: databaseUrl, socket, token, pgBin };
    const appEnv = sealedEnvironment(resources);
    await completed(child(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], appEnv, resolve(directory, "migrations.log")));
    resources.applicationUrl = await provisionApplicationRole(databaseUrl);
    const server = await ledger(socket, resolve(directory, "clock.json"));
    return { resources, close: async () => {
      server.close();
      try {
        await pg("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
        // Recursive removal is fenced to this execution's verified owned cluster.
        const marker = JSON.parse(await readFile(resolve(directory, "owner.json"), "utf8"));
        const root = resolve(".cache", "api-tests") + sep;
        if (!directory.startsWith(root) || !/^[\da-f-]{36}$/.test(directory.slice(root.length))
          || marker.token !== token || resolve(data) !== resolve(directory, "data")) throw new Error("TEST_CLEANUP_NOT_OWNED");
        await rm(data, { recursive: true, maxRetries: 3, retryDelay: 200 });
        await unlink(passwordFile);
      } finally { await writeFile("next-env.d.ts", originalNextEnv); }
    } };
  } catch (error) {
    if (started) await pg("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]).catch(() => {});
    throw new Error(`BLOCKED_API_TEST_SETUP: ${error instanceof Error ? error.message : "UNKNOWN"}; revisar logs locales en ${directory}`);
  }
}

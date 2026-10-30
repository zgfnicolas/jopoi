import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = "17.11-5";
const ARCHIVE_URL = `https://get.enterprisedb.com/postgresql/postgresql-${VERSION}-windows-x64-binaries.zip`;
const ARCHIVE_SHA256 = "80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f";
const SOURCE_URL = "https://www.enterprisedb.com/download-postgresql-binaries";
const CHECKSUM_URL = `${ARCHIVE_URL}.sha256`;
const PORT = 54321;

function workspacePath(...parts: string[]): string {
  const path = resolve(ROOT, ...parts);
  if (!path.startsWith(`${ROOT}${sep}`)) throw new LocalPostgresError("LOCAL_POSTGRES_PATH_INVALID");
  return path;
}

const HOME = workspacePath(".tools", "postgresql", VERSION);
const BIN = join(HOME, "pgsql", "bin");
const CACHE = workspacePath(".cache", "postgresql-17");
const DATA = join(CACHE, "data");
const CREDENTIALS = join(CACHE, "connection.json");
const ARCHIVE = workspacePath(".tools", "postgresql", `postgresql-${VERSION}-windows-x64-binaries.zip`);

class LocalPostgresError extends Error {}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

interface LocalConnection { password: string }

async function readConnection(): Promise<LocalConnection> {
  const value: unknown = JSON.parse(await readFile(CREDENTIALS, "utf8"));
  if (value === null || typeof value !== "object" || !("password" in value)
    || typeof value.password !== "string" || !/^[a-f0-9]{64}$/.test(value.password)) {
    throw new LocalPostgresError("LOCAL_POSTGRES_CREDENTIALS_INVALID");
  }
  return { password: value.password };
}

async function run(
  executable: string,
  args: string[],
  password?: string,
  daemon = false,
): Promise<{ code: number; stdout: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, args, {
      cwd: ROOT,
      shell: false,
      windowsHide: true,
      env: { ...process.env, ...(password === undefined ? {} : { PGPASSWORD: password }), PGCONNECT_TIMEOUT: "3" },
      // pg_ctl inicia un daemon: sus hijos no deben heredar pipes que mantienen abierto el CLI.
      stdio: daemon ? "ignore" : ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", () => reject(new LocalPostgresError("LOCAL_POSTGRES_PROCESS_UNAVAILABLE")));
    child.on("close", (code) => {
      if (code !== 0 && stderr !== "") {
        // Diagnóstico privado del comando, sin PGPASSWORD ni volcado del entorno.
        void writeFile(join(CACHE, "last-command.log"), stderr, { mode: 0o600 }).catch(() => {});
      }
      resolveRun({ code: code ?? 1, stdout });
    });
  });
}

async function pg(command: string, args: string[], password?: string) {
  return run(join(BIN, `${command}.exe`), args, password, command === "pg_ctl" && args.includes("start"));
}

async function requireSuccess(result: { code: number }): Promise<void> {
  if (result.code !== 0) throw new LocalPostgresError("LOCAL_POSTGRES_COMMAND_FAILED: revisar .cache/postgresql-17/last-command.log");
}

async function prepareBinaries(): Promise<void> {
  await mkdir(dirname(ARCHIVE), { recursive: true });
  if (!(await exists(ARCHIVE))) {
    console.log(`Descargando PostgreSQL ${VERSION} desde EDB...`);
    const response = await fetch(ARCHIVE_URL, { signal: AbortSignal.timeout(600000) });
    if (!response.ok) throw new LocalPostgresError("LOCAL_POSTGRES_DOWNLOAD_FAILED");
    await writeFile(ARCHIVE, new Uint8Array(await response.arrayBuffer()));
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(ARCHIVE)) hash.update(chunk);
  if (hash.digest("hex") !== ARCHIVE_SHA256) throw new LocalPostgresError("LOCAL_POSTGRES_CHECKSUM_MISMATCH");

  if (!(await exists(join(BIN, "postgres.exe")))) {
    await mkdir(HOME, { recursive: true });
    await requireSuccess(await run(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), [
      "-xf", ARCHIVE, "-C", HOME,
    ]));
  }
  const version = await pg("postgres", ["--version"]);
  await requireSuccess(version);
  if (!/^postgres \(PostgreSQL\) 17\.11\b/.test(version.stdout.trim())) {
    throw new LocalPostgresError("LOCAL_POSTGRES_BINARY_VERSION_MISMATCH");
  }
  await writeFile(join(HOME, "source.json"), JSON.stringify({
    version: VERSION, sourceUrl: SOURCE_URL, archiveUrl: ARCHIVE_URL,
    checksumUrl: CHECKSUM_URL, sha256: ARCHIVE_SHA256,
  }, null, 2) + "\n");
}

async function ensureLocalEnvironment(password: string): Promise<void> {
  const path = workspacePath(".env.local");
  let content = await exists(path) ? await readFile(path, "utf8") : "";
  const variables = parse(content);
  const url = `postgresql://jopoi:${password}@127.0.0.1:${PORT}/jopoi`;
  for (const name of ["DATABASE_URL", "DIRECT_URL", "DATABASE_URL_UNPOOLED"]) {
    if ((variables[name]?.trim() && variables[name] !== url)
      || (process.env[name]?.trim() && process.env[name] !== url)) {
      throw new LocalPostgresError("LOCAL_DATABASE_ENV_CONFLICT: no se reemplazan conexiones existentes");
    }
  }
  for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
    const pattern = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=.*$`, "gm");
    content = pattern.test(content)
      ? content.replace(pattern, `${name}=${url}`)
      : `${content}${content.endsWith("\n") || content === "" ? "" : "\n"}${name}=${url}\n`;
  }
  await writeFile(path, content, { mode: 0o600 });
}

async function checkPort(): Promise<void> {
  await new Promise<void>((resolvePort, reject) => {
    const server = createServer();
    server.once("error", () => reject(new LocalPostgresError("LOCAL_POSTGRES_PORT_IN_USE")));
    server.listen(PORT, "127.0.0.1", () => { server.close(() => resolvePort()); });
  });
}

async function start(): Promise<void> {
  if (!(await exists(join(DATA, "PG_VERSION")))) throw new LocalPostgresError("LOCAL_POSTGRES_SETUP_REQUIRED");
  if ((await readFile(join(DATA, "PG_VERSION"), "utf8")).trim() !== "17") {
    throw new LocalPostgresError("LOCAL_POSTGRES_DATA_VERSION_MISMATCH");
  }
  if ((await pg("pg_ctl", ["-D", DATA, "status"])).code === 0) {
    console.log("PostgreSQL local ya está iniciado.");
    return;
  }
  await checkPort();
  await requireSuccess(await pg("pg_ctl", ["-D", DATA, "-l", join(CACHE, "server.log"), "-w", "-t", "30", "start"]));
  console.log(`PostgreSQL local disponible en 127.0.0.1:${PORT}.`);
}

async function setup(): Promise<void> {
  await mkdir(CACHE, { recursive: true });
  await prepareBinaries();
  const initialized = await exists(join(DATA, "PG_VERSION"));
  if (initialized && !(await exists(CREDENTIALS))) throw new LocalPostgresError("LOCAL_POSTGRES_CREDENTIALS_MISSING");
  const connection = await exists(CREDENTIALS) ? await readConnection() : { password: randomBytes(32).toString("hex") };
  await ensureLocalEnvironment(connection.password);
  await writeFile(CREDENTIALS, JSON.stringify(connection) + "\n", { mode: 0o600 });

  if (!initialized) {
    const passwordFile = join(CACHE, "init-password.txt");
    await writeFile(passwordFile, connection.password + "\n", { mode: 0o600 });
    try {
      await requireSuccess(await pg("initdb", ["-D", DATA, "-U", "jopoi", "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C", `--pwfile=${passwordFile}`]));
    } finally {
      await unlink(passwordFile);
    }
    await writeFile(join(DATA, "postgresql.auto.conf"), [
      "listen_addresses = '127.0.0.1'", `port = ${PORT}`, "max_connections = 20",
      "shared_buffers = '32MB'", "timezone = 'UTC'", "log_statement = 'none'",
      "log_min_error_statement = 'panic'", "log_error_verbosity = 'terse'", "",
    ].join("\n"));
  }
  await start();
  const args = ["-X", "--no-password", "-h", "127.0.0.1", "-p", String(PORT), "-U", "jopoi", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"];
  const found = await pg("psql", [...args, "-c", "SELECT 1 FROM pg_database WHERE datname = 'jopoi'"], connection.password);
  await requireSuccess(found);
  if (found.stdout.trim() !== "1") {
    await requireSuccess(await pg("createdb", ["--no-password", "-h", "127.0.0.1", "-p", String(PORT), "-U", "jopoi", "jopoi"], connection.password));
  }
  console.log("Base jopoi preparada. Conexiones privadas guardadas sin mostrar credenciales.");
}

async function main(): Promise<void> {
  if (process.platform !== "win32" || process.arch !== "x64") throw new LocalPostgresError("LOCAL_POSTGRES_REQUIRES_WINDOWS_X64");
  const command = process.argv[2] ?? "start";
  // CI necesita sólo binarios verificados; no crees una base habitual ni un .env.local.
  if (command === "prepare") return prepareBinaries();
  if (command === "setup") return setup();
  if (command === "start") return start();
  if (command === "status") {
    const running = await exists(join(BIN, "pg_ctl.exe")) && (await pg("pg_ctl", ["-D", DATA, "status"])).code === 0;
    console.log(running ? "PostgreSQL local iniciado." : "PostgreSQL local detenido o sin preparar.");
    return;
  }
  if (command === "stop") {
    if (await exists(join(BIN, "pg_ctl.exe")) && (await pg("pg_ctl", ["-D", DATA, "status"])).code === 0) {
      await requireSuccess(await pg("pg_ctl", ["-D", DATA, "-m", "fast", "-w", "-t", "30", "stop"]));
    }
    console.log("PostgreSQL local detenido; datos conservados.");
    return;
  }
  throw new LocalPostgresError("LOCAL_POSTGRES_COMMAND_INVALID");
}

main().catch((error: unknown) => {
  console.error(error instanceof LocalPostgresError ? error.message : "LOCAL_POSTGRES_FAILED");
  process.exitCode = 1;
});

import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ChildProcess } from "node:child_process";
import type { TestResources } from "./runtime-provision";
import { child, completed, stop } from "./process";
import { sealedEnvironment } from "./test-environment";
import { createFixtures } from "./sql-fixtures";
import { rpc } from "./ipc";
import type { NetworkMode } from "./ledger";

export interface HttpResult<T> { status: number; body: T; headers: Headers }
export async function eventually<T>(read: () => Promise<T>, ready: (value: T) => boolean, label = "observable state", timeout = 20000): Promise<T> {
  const deadline = Date.now() + timeout;
  let latest: T | undefined;
  while (Date.now() < deadline) {
    latest = await read();
    if (ready(latest)) return latest;
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw new Error(`TIMEOUT_WAITING_FOR_${label}: ${JSON.stringify(latest)}`);
}

export class TestRuntime {
  constructor(private readonly context?: TestResources, private readonly bundler: "turbopack" | "webpack" = "turbopack") {}
  get resources(): TestResources {
    if (!this.context) throw new Error("TEST_RESOURCES_MISSING");
    return this.context;
  }
  process?: ChildProcess;
  mode: NetworkMode = "confirmed";
  overrides: Record<string, string | undefined> = {};
  get origin() { return `http://127.0.0.1:${this.resources.httpPort}`; }
  get env(): NodeJS.ProcessEnv { return { ...sealedEnvironment(this.resources), ...(this.bundler === "webpack" ? { JOPOI_E2E_BUNDLER: "webpack" } : {}), ...this.overrides }; }
  async clock(iso: string) {
    const file = resolve(this.resources.directory, "clock.json");
    await writeFile(file + ".next", JSON.stringify(iso));
    await rename(file + ".next", file);
  }
  async advance(milliseconds: number) {
    const iso = JSON.parse(await readFile(resolve(this.resources.directory, "clock.json"), "utf8"));
    await this.clock(new Date(new Date(iso).getTime() + milliseconds).toISOString());
  }
  async network(mode: NetworkMode, release = false) { this.mode = mode; await rpc(this.resources.socket, "control", { mode, release }); }
  async ledger() { return rpc<{ submissions: string[]; messages: Array<{ transactionId: string; envelope: { eventId: string; ordinal: number }; submitted: boolean }> }>(this.resources.socket, "inspect"); }
  async start() {
    this.process = child(process.execPath, ["node_modules/next/dist/bin/next", "dev", ...(this.bundler === "webpack" ? ["--webpack"] : []), "--hostname", "127.0.0.1", "--port", String(this.resources.httpPort)], this.env, resolve(this.resources.directory, "next.log"));
    await eventually(async () => {
      if (this.process?.exitCode !== null || this.process?.signalCode !== null) throw new Error("BLOCKED_NEXT_SERVER_EXITED; revisar next.log");
      let status: number;
      try { status = (await fetch(this.origin + "/api/demo/session", { signal: AbortSignal.timeout(3000) })).status; }
      catch { return 0; }
      if (status >= 500) throw new Error("BLOCKED_NEXT_ROUTE_FAILED; revisar next.log");
      return status;
    }, status => status === 401, "NEXT_READY", 90000);
    if (this.bundler === "webpack") {
      // Compile every UI entry before the browser's 15s request budget starts.
      // GETs without cookies use protected/unknown resources or unsupported methods; no commands run.
      const sample = "00000000-0000-4000-8000-000000000000";
      const assets = new Set<string>();
      for (const path of ["/", "/demo", `/trazabilidad/${sample}`]) {
        const response = await fetch(this.origin + path, { signal: AbortSignal.timeout(60000) });
        const html = await response.text();
        if (response.headers.get("content-type")?.includes("text/html")) {
          for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^" ]+)"/g)) {
            if (match[1].startsWith("/_next/static/")) assets.add(match[1].replaceAll("&amp;", "&"));
          }
        }
        if (response.status >= 500) throw new Error("BLOCKED_NEXT_PAGE_FAILED; revisar next.log");
      }
      // HTML prewarming alone leaves dev JS/CSS cold. Complete those read-only
      // downloads before the browser's navigation and action budgets begin.
      for (const asset of assets) {
        const response = await fetch(this.origin + asset, { signal: AbortSignal.timeout(60000) });
        await response.arrayBuffer();
        if (!response.ok) throw new Error("BLOCKED_NEXT_ASSET_FAILED; revisar next.log");
      }
      // Compile API entries last: creating the client graph can invalidate dev entries.
      for (const path of ["/api/demo/session", "/api/demo/runs/current", "/api/demo/runs", "/api/demo/runs/reset",
        `/api/demo/runs/${sample}`, `/api/demo/runs/${sample}/commands`,
        `/api/demo/runs/${sample}/events/${sample}/retry`, "/api/demo-requests",
        `/api/traces/${sample}`, `/api/traces/${sample}/events/${sample}/verification`, "/api/cron"]) {
        const response = await fetch(this.origin + path, { signal: AbortSignal.timeout(60000) });
        await response.text();
        if (response.status >= 500) throw new Error("BLOCKED_NEXT_API_FAILED; revisar next.log");
      }
    }
  }
  async close() { await stop(this.process); this.process = undefined; }
  async restart(overrides: Record<string, string | undefined> = {}) { await this.close(); this.overrides = { ...this.overrides, ...overrides }; await this.start(); }
  async reset(time = "2026-01-01T12:00:00.000Z") {
    await this.close();
    await rpc(this.resources.socket, "control", { reset: true, release: true, mode: "confirmed" });
    await createFixtures(this.resources).exceptional.restoreEventCommit();
    await createFixtures(this.resources).clear();
    this.overrides = {};
    this.mode = "confirmed";
    await this.clock(time);
    await this.start();
  }
  async cron(secret = this.env.CRON_SECRET) {
    const response = await fetch(this.origin + "/api/cron", { headers: { Authorization: `Bearer ${secret}` } });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  }
  async database(action: "start" | "stop") {
    const args = ["-D", resolve(this.resources.directory, "data")];
    if (action === "start") args.push("-l", resolve(this.resources.directory, "postgres.log"), "-o", `-h 127.0.0.1 -p ${this.resources.pgPort}`);
    else args.push("-m", "immediate");
    await completed(child(resolve(this.resources.pgBin, "pg_ctl.exe"), [...args, "-w", action], this.env));
  }
  async exportContacts(): Promise<string> {
    const log = resolve(this.resources.directory, `export-${randomUUID()}.log`);
    await completed(child(process.execPath, ["--import", "tsx", "--", "scripts/export-contacts.ts"], this.env, log));
    const output = (await readFile(log, "utf8")).trim().split(/\r?\n/).at(-1)!;
    const { file } = JSON.parse(output);
    if (!resolve(file).startsWith(resolve(".cache", "exports") + (process.platform === "win32" ? "\\" : "/"))) throw new Error("EXPORT_OUTSIDE_PRIVATE_DIRECTORY");
    try { return await readFile(file, "utf8"); } finally { await unlink(file); }
  }
}



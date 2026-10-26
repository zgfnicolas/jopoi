import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ChildProcess } from "node:child_process";
import { inject } from "vitest";
import type { DemoRunIntentResponse, DemoSessionResponse } from "../../src/shared/session-contracts";
import type { DemoCommandResponse, DemoRunResponse } from "../../src/shared/run-contracts";
import type { OperationCommand } from "../../src/shared/operation-contracts";
import type { PublicationRetryResponse } from "../../src/shared/event-contracts";
import type { PublicTraceResponse, PublicTraceVerificationResponse } from "../../src/shared/trace-contracts";
import { child, completed, stop } from "./process";
import { sealedEnvironment } from "./test-environment";
import { clearFixtures, exceptional } from "./fixtures";
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

class ApiEnvironment {
  process?: ChildProcess;
  mode: NetworkMode = "confirmed";
  overrides: Record<string, string | undefined> = {};
  get resources() { return inject("resources"); }
  get origin() { return `http://127.0.0.1:${this.resources.httpPort}`; }
  get env() { return { ...sealedEnvironment(this.resources), ...this.overrides }; }
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
    this.process = child(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(this.resources.httpPort)], this.env, resolve(this.resources.directory, "next.log"));
    await eventually(async () => {
      if (this.process?.exitCode !== null || this.process?.signalCode !== null) throw new Error("BLOCKED_NEXT_SERVER_EXITED; revisar next.log");
      let status: number;
      try { status = (await fetch(this.origin + "/api/demo/session", { signal: AbortSignal.timeout(3000) })).status; }
      catch { return 0; }
      if (status >= 500) throw new Error("BLOCKED_NEXT_ROUTE_FAILED; revisar next.log");
      return status;
    }, status => status === 401, "NEXT_READY", 90000);
  }
  async close() { await stop(this.process); this.process = undefined; }
  async restart(overrides: Record<string, string | undefined> = {}) { await this.close(); this.overrides = { ...this.overrides, ...overrides }; await this.start(); }
  async reset() {
    await this.close();
    await rpc(this.resources.socket, "control", { reset: true, release: true, mode: "confirmed" });
    await exceptional.restoreEventCommit();
    await clearFixtures();
    this.overrides = {};
    this.mode = "confirmed";
    await this.clock("2026-01-01T12:00:00.000Z");
    await this.start();
  }
  async cron(secret = this.env.CRON_SECRET) {
    return new Visitor().request<Record<string, unknown>>("GET", "/api/cron", undefined, { Authorization: `Bearer ${secret}` });
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
export const environment = new ApiEnvironment();

export class Visitor {
  cookie = "";
  traceId = "";
  async request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<HttpResult<T>> {
    const response = await fetch(environment.origin + path, {
      method, headers: { ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(method === "POST" ? { Origin: environment.origin, "X-Jopoi-Request": "demo", "Content-Type": "application/json" } : {}), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60000),
    });
    const cookie = response.headers.get("set-cookie");
    if (cookie) this.cookie = cookie.split(";")[0];
    return { status: response.status, body: await response.json() as T, headers: response.headers };
  }
  get<T = DemoRunResponse>(path: string) { return this.request<T>("GET", path); }
  post<T = DemoCommandResponse>(path: string, body: unknown, headers?: Record<string, string>) { return this.request<T>("POST", path, body, headers); }
  async begin() {
    const result = await this.post<DemoSessionResponse>("/api/demo/session", {});
    if (![200, 201].includes(result.status)) throw new Error(`BEGIN_FAILED_${result.status}`);
    return result;
  }
  async start(reset = false, requestId = randomUUID()) {
    const result = await this.post<DemoRunIntentResponse>(reset ? "/api/demo/runs/reset" : "/api/demo/runs", { requestId });
    if (![200, 201].includes(result.status)) throw new Error(`START_FAILED_${result.status}_${JSON.stringify(result.body)}`);
    this.traceId = result.body.run.traceId;
    return result.body;
  }
  async setup() { await this.begin(); await this.start(); return this; }
  async run() {
    const result = await this.get(`/api/demo/runs/${this.traceId}`);
    if (result.status !== 200 || !result.body.run) throw new Error(`RUN_FAILED_${result.status}`);
    return result.body.run;
  }
  async command(command: OperationCommand, requestId = randomUUID()) {
    const version = (await this.run()).version;
    return this.post(`/api/demo/runs/${this.traceId}/commands`, { ...command, requestId, expectedVersion: version });
  }
  async apply(command: OperationCommand) {
    const result = await this.command(command);
    if (result.status !== 200) throw new Error(`COMMAND_FAILED_${JSON.stringify(result.body)}`);
    // Ordinary guided flows wait for the network result before their next step.
    // Race/fault scenarios use command()/post() directly and assert intermediate states.
    if (result.body.event && environment.mode === "confirmed") {
      let stable = 0;
      await eventually(() => this.run(), run => {
        stable = run.events.every(event => event.publication.verificationState === "MATCHED") ? stable + 1 : 0;
        return stable >= 2;
      });
    }
    return result.body;
  }
  publish(quantityKg = "12000", humidityPercent = "28") { return this.apply({ role: "generator", action: "publish", quantityKg, humidityPercent }); }
  async pickup() {
    await this.publish();
    await this.apply({ role: "coordinator", action: "approve" });
    await this.apply({ role: "coordinator", action: "assign", tripId: "return-a" });
    await this.apply({ role: "carrier", action: "pickup" });
  }
  trace() { return this.get<PublicTraceResponse>(`/api/traces/${this.traceId}`); }
  verification(eventId: string) { return this.get<PublicTraceVerificationResponse>(`/api/traces/${this.traceId}/events/${eventId}/verification`); }
  retry(eventId: string, requestId = randomUUID()) { return this.post<PublicationRetryResponse>(`/api/demo/runs/${this.traceId}/events/${eventId}/retry`, { requestId }); }
}

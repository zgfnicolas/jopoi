import { randomUUID } from "node:crypto";
import { inject } from "vitest";
import type { DemoRunIntentResponse, DemoSessionResponse } from "../../src/shared/session-contracts";
import type { DemoCommandResponse, DemoRunResponse } from "../../src/shared/run-contracts";
import type { OperationCommand } from "../../src/shared/operation-contracts";
import type { PublicationRetryResponse } from "../../src/shared/event-contracts";
import type { PublicTraceResponse, PublicTraceVerificationResponse } from "../../src/shared/trace-contracts";
import { TestRuntime, eventually, type HttpResult } from "./runtime";
export { eventually } from "./runtime";
export type { HttpResult } from "./runtime";
class ApiEnvironment extends TestRuntime {
  constructor() { super(); }
  override get resources() { return inject("resources"); }
}
export const environment = new ApiEnvironment();
export class Visitor {
  identity = randomUUID();
  cookie = "";
  traceId = "";
  async request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<HttpResult<T>> {
    const response = await fetch(environment.origin + path, {
      method, headers: { "X-S21-Visitor": this.identity, ...(this.cookie ? { Cookie: this.cookie } : {}),
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

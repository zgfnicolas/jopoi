import { randomUUID } from "node:crypto";
import { assertApiContract } from "./api-contract";
import { inject } from "vitest";
import type { DemoRunIntentResponse, DemoSessionResponse } from "../../src/shared/session-contracts";
import type { DemoCommandResponse, DemoRunResponse, OperationPatchResponse, OperationResource } from "../../src/shared/run-contracts";
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
  identity: string = randomUUID();
  cookie = "";
  csrfToken = "";
  traceId = "";
  async request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<HttpResult<T>> {
    const response = await fetch(environment.origin + path, {
      method, headers: { "X-S21-Visitor": this.identity, ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(method === "POST" || method === "DELETE" || method === "PATCH" ? { Origin: environment.origin, "X-Jopoi-Request": "demo",
          ...(this.csrfToken ? { "X-CSRF-Token": this.csrfToken } : {}) } : {}),
        ...(method === "POST" || method === "PATCH" ? { "Content-Type": "application/json" } : {}), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60000),
    });
    const setCookies = typeof (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (response.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")!] : []);
    for (const c of setCookies) {
      const match = /^([^=;\s]+)=([^;]*)/.exec(c);
      if (match) {
        const [, name, val] = match;
        if (/max-age=0/i.test(c) || /expires=thu, 01 jan 1970/i.test(c)) {
          if (this.cookie.startsWith(`${name}=`)) this.cookie = "";
        } else if (val && val.length > 0) {
          this.cookie = `${name}=${val}`;
        }
      }
    }
    if (response.status === 401 || response.status === 204) {
      this.cookie = "";
      this.csrfToken = "";
    }
    const responseBody: unknown = response.status === 204 || response.status === 304 ? null : await response.json().catch(() => null);
    const csrf = response.headers.get("x-csrf-token")
      ?? (responseBody && typeof responseBody === "object" && "csrfToken" in responseBody && typeof (responseBody as Record<string, unknown>).csrfToken === "string"
        ? (responseBody as Record<string, unknown>).csrfToken as string
        : undefined);
    if (csrf) this.csrfToken = csrf;
    assertApiContract(method, path, response.status, response.headers, responseBody);
    return { status: response.status, body: responseBody as T, headers: response.headers };
  }
  get<T = DemoRunResponse>(path: string, headers?: Record<string, string>) { return this.request<T>("GET", path, undefined, headers); }
  post<T = DemoCommandResponse>(path: string, body: unknown, headers?: Record<string, string>) { return this.request<T>("POST", path, body, headers); }
  patch<T = OperationPatchResponse>(path: string, body: unknown, headers?: Record<string, string>) { return this.request<T>("PATCH", path, body, headers); }
  delete<T = void>(path: string, headers?: Record<string, string>) { return this.request<T>("DELETE", path, undefined, headers); }
  async end() { return this.delete("/api/demo/session"); }
  async operationResource(traceId = this.traceId, headers?: Record<string, string>) {
    return this.get<OperationResource>(`/api/demo/runs/${traceId}/operation`, headers);
  }
  async patchOp(command: OperationCommand, options?: { ifMatch?: string; idempotencyKey?: string; headers?: Record<string, string> }) {
    const currentOp = await this.operationResource();
    const ifMatch = options?.ifMatch ?? currentOp.headers.get("etag") ?? undefined;
    const idempotencyKey = options?.idempotencyKey ?? randomUUID();
    const headers = {
      ...(ifMatch ? { "If-Match": ifMatch } : {}),
      "Idempotency-Key": idempotencyKey,
      ...options?.headers,
    };
    return this.patch<OperationPatchResponse>(`/api/demo/runs/${this.traceId}/operation`, command, headers);
  }
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
      await eventually(() => this.run(), run => run.events.every(event => event.publication.verificationState === "MATCHED"));
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
  trace(headers?: Record<string, string>, traceId = this.traceId) {
    return this.get<PublicTraceResponse>(`/api/traces/${traceId}`, headers);
  }
  traceV1(headers?: Record<string, string>, traceId = this.traceId) {
    return this.get<PublicTraceResponse>(`/api/v1/traces/${traceId}`, headers);
  }
  verification(eventId: string, headers?: Record<string, string>, traceId = this.traceId) {
    return this.get<PublicTraceVerificationResponse>(`/api/traces/${traceId}/events/${eventId}/verification`, headers);
  }
  verificationV1(eventId: string, headers?: Record<string, string>, traceId = this.traceId) {
    return this.get<PublicTraceVerificationResponse>(`/api/v1/traces/${traceId}/events/${eventId}/verification`, headers);
  }
  retry(eventId: string, requestId = randomUUID()) { return this.post<PublicationRetryResponse>(`/api/demo/runs/${this.traceId}/events/${eventId}/retry`, { requestId }); }
}

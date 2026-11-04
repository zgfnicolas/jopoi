import assert from "node:assert/strict";
import { test } from "node:test";
import { apiBoundary, readJsonBody } from "../../src/server/http";
import { ApplicationError } from "../../src/server/application-error";
import { DEFAULT_DEADLINE_POLICY, mirrorVerificationBudgetMs, raceWithReadAbort, sqlStepBudget } from "../../src/server/deadlines";
import { PROBLEM_MEDIA_TYPE, problemDetailsSchema } from "../../src/shared/problem-details";

test("S22-12: boundary conserva privacidad, referencias y Retry-After conocido de 503", async () => {
  const response = await apiBoundary("contacts.create", new Request("https://example.invalid/api/demo-requests", { headers: { Accept: PROBLEM_MEDIA_TYPE } }), async () => {
    throw new ApplicationError("DATABASE_UNAVAILABLE", { email: ["PRIVATE email SQL"], PRIVATE: ["PRIVATE"] }, { cause: new Error("PRIVATE"), retryAfterSeconds: 20 });
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "20");
  assert.equal(response.headers.get("content-type"), PROBLEM_MEDIA_TYPE);
  const body: unknown = await response.json();
  const parsed = problemDetailsSchema.parse(body);
  assert.equal(parsed.requestId, response.headers.get("x-request-id"));
  assert.equal(parsed.fields, undefined);
  assert.ok(!JSON.stringify(body).includes("PRIVATE"));
});

test("S22-13: readJsonBody acota bytes sin Content-Length o con Content-Length falso y cancela el stream", async () => {
  for (const headers of [{ "Content-Type": "application/json" }, { "Content-Type": "application/json", "Content-Length": "2" }] as const) {
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(3000))); },
      cancel() { canceled = true; },
    });
    const request = new Request("https://example.invalid/api/demo/runs", { method: "POST", headers, body: stream, duplex: "half" } as RequestInit);
    await assert.rejects(() => readJsonBody(request, 4096), (error: unknown) => error instanceof ApplicationError && error.code === "INVALID_INPUT");
    assert.equal(canceled, true);
  }
});

test("S22-13: readJsonBody corta cuerpos lentos o abortados y libera el lector del stream", async () => {
  let slowCanceled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slowStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"requestId":'));
      timer = setTimeout(() => controller.enqueue(new TextEncoder().encode('"00000000-0000-4000-8000-000000000001"}')), 500);
    },
    cancel() {
      slowCanceled = true;
      if (timer) clearTimeout(timer);
    },
  });
  const slowRequest = new Request("https://example.invalid/api/demo/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: slowStream, duplex: "half" } as RequestInit);
  const started = Date.now();
  await assert.rejects(() => readJsonBody(slowRequest, 4096, 40), (error: unknown) => error instanceof ApplicationError && error.code === "INVALID_INPUT");
  assert.ok(Date.now() - started < 250);
  assert.equal(slowCanceled, true);

  let abortedCanceled = false;
  const abortController = new AbortController();
  const abortStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"requestId":'));
      setTimeout(() => abortController.abort(), 15);
    },
    cancel() { abortedCanceled = true; },
  });
  const abortedRequest = new Request("https://example.invalid/api/demo/runs", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: abortStream, signal: abortController.signal, duplex: "half",
  } as RequestInit);
  await assert.rejects(() => readJsonBody(abortedRequest, 4096, 1000), (error: unknown) => error instanceof ApplicationError && error.code === "INVALID_INPUT");
  assert.equal(abortedCanceled, true);
});

test("S22-13: presupuestos por paso SQL y Mirror Node respetan el deadline total del request", async () => {
  assert.ok(DEFAULT_DEADLINE_POLICY.sqlMaxWaitMs + DEFAULT_DEADLINE_POLICY.sqlTimeoutMs < DEFAULT_DEADLINE_POLICY.readDeadlineMs);
  assert.ok(DEFAULT_DEADLINE_POLICY.mirrorTotalTimeoutMs + DEFAULT_DEADLINE_POLICY.verificationClosingReserveMs < DEFAULT_DEADLINE_POLICY.verificationDeadlineMs);
  assert.equal(DEFAULT_DEADLINE_POLICY.verificationDeadlineMs, 10000);

  const ample = sqlStepBudget(DEFAULT_DEADLINE_POLICY, 8000);
  assert.equal(ample.maxWait, 2000);
  assert.equal(ample.timeout, 5000);

  const tight = sqlStepBudget(DEFAULT_DEADLINE_POLICY, 900);
  assert.ok(tight.maxWait + tight.timeout <= 900);
  assert.throws(() => sqlStepBudget(DEFAULT_DEADLINE_POLICY, 10), (error: unknown) => error instanceof ApplicationError && error.code === "DATABASE_UNAVAILABLE");

  assert.equal(mirrorVerificationBudgetMs(DEFAULT_DEADLINE_POLICY, 9500), 6000);
  assert.equal(mirrorVerificationBudgetMs(DEFAULT_DEADLINE_POLICY, 2200), 700);
  assert.equal(mirrorVerificationBudgetMs(DEFAULT_DEADLINE_POLICY, 1200), 0);

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 15);
  await assert.rejects(
    () => raceWithReadAbort(() => new Promise(resolve => setTimeout(resolve, 300)), controller.signal),
    (error: unknown) => error instanceof ApplicationError && error.code === "DATABASE_UNAVAILABLE",
  );
});

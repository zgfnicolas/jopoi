import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { z } from "zod";
import { API_ERROR_CATALOG, isApiErrorCode } from "../../src/shared/api-errors";
import { API_ACCEPT, PROBLEM_MEDIA_TYPE, acceptsProblemDetails, problemType } from "../../src/shared/problem-details";
import { readApi } from "../../src/frontend/api";
import { postOperation } from "../../src/frontend/operation-api";
import { postDemoRequest } from "../../src/frontend/demo-request";
import { retryAfterSeconds } from "../../src/frontend/retry-after";
import { clearCsrfToken, getCsrfToken } from "../../src/frontend/csrf";

const success = z.strictObject({ saved: z.literal(true) });
const sessionSuccess = z.object({ session: z.object({ expiresAt: z.string(), runCount: z.number(), remainingRuns: z.number() }), activeRun: z.null(), csrfToken: z.string().optional() });
const calls = (signal: AbortSignal) => [() => readApi("/api/demo/session", success, signal),
  () => postOperation("/api/demo/session", "{}", success, [200, 201], signal), () => postDemoRequest("{}", signal)];

for (const media of ["application/json", PROBLEM_MEDIA_TYPE]) {
  test(`S22-12: tres transportes aceptan ${media}, códigos/status y campos seguros sin reintentar`, async t => {
    let body: unknown, status = 500, requests = 0;
    const requestId = randomUUID();
    t.mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => {
      requests++; assert.equal(new Headers(init?.headers).get("accept"), API_ACCEPT);
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": media + "; charset=utf-8", "Retry-After": "15" } });
    });
    for (const [code, definition] of Object.entries(API_ERROR_CATALOG)) {
      if (!isApiErrorCode(code)) throw new Error("CATALOG_CODE_INVALID");
      status = definition.status;
      const fields = { email: ["person@example.invalid PRIVATE"], signedBytes: ["PRIVATE"] };
      body = media === PROBLEM_MEDIA_TYPE ? { type: problemType(code), title: "Título seguro", status, detail: definition.message, code, requestId, traceId: "1".repeat(32), fields }
        : { error: { code, requestId, message: definition.message, fields } };
      for (const invoke of calls(new AbortController().signal)) {
        const result = await invoke(); assert.equal(result.ok, false);
        if (result.ok) throw new Error("UNEXPECTED_SUCCESS");
        assert.equal(result.error.code, code); assert.equal(result.error.retryAfter, 15);
        assert.ok(!JSON.stringify(result).includes("PRIVATE"));
      }
    }
    assert.equal(requests, Object.keys(API_ERROR_CATALOG).length * 3);
  });
}

test("S22-12: error desconocido, status incoherente, JSON roto o media type falso nunca confirman éxito", async t => {
  let payload: string, status = 503, media = PROBLEM_MEDIA_TYPE;
  t.mock.method(globalThis, "fetch", async () => new Response(payload, { status, headers: { "Content-Type": media } }));
  const valid = { type: problemType("DATABASE_UNAVAILABLE"), title: "Servicio no disponible", status: 503, detail: "Seguro", code: "DATABASE_UNAVAILABLE", requestId: randomUUID(), traceId: "1".repeat(32) };
  for (const value of [{ ...valid, code: "FUTURE_CODE" }, { ...valid, status: 500 }, { ...valid, type: "urn:other" }, { ...valid, requestId: undefined }, { error: { code: "INVALID_INPUT" } }, { saved: true }]) {
    payload = JSON.stringify(value);
    for (const invoke of calls(new AbortController().signal)) assert.equal((await invoke()).ok, false);
  }
  payload = "{";
  for (const invoke of calls(new AbortController().signal)) assert.equal((await invoke()).ok, false);
  status = 200; payload = JSON.stringify({ ...valid, saved: true });
  for (const invoke of calls(new AbortController().signal)) assert.equal((await invoke()).ok, false);
  media = "text/html";
  for (const invoke of calls(new AbortController().signal)) assert.equal((await invoke()).ok, false);
});

test("S22-12: negociación explícita respeta prioridades y exclusiones", () => {
  for (const accept of [null, "*/*", "application/json", "application/problem+json;q=0", "application/json, application/problem+json;q=0.5", "application/problem+json;q=2"]) assert.equal(acceptsProblemDetails(accept), false);
  for (const accept of [API_ACCEPT, PROBLEM_MEDIA_TYPE, "application/problem+json;q=0.8, application/json;q=0.5"]) assert.equal(acceptsProblemDetails(accept), true);
});

test("S22-12: Retry-After admite segundos y fecha HTTP sin inventar plazos", () => {
  const date = "Thu, 01 Jan 2026 12:00:00 GMT";
  for (const [value, expected] of [["0", 0], ["15", 15], ["86400", 86400], ["86401", undefined], ["-1", undefined], ["1.5", undefined], ["nunca", undefined], ["Thu, 01 Jan 2026 12:00:15 GMT", 15], ["Thu, 01 Jan 2026 11:59:59 GMT", 0]] as const) {
    assert.equal(retryAfterSeconds(new Response(null, { headers: { "Retry-After": value, Date: date } }), 0), expected);
  }
  assert.equal(retryAfterSeconds(new Response()), undefined);
});

test("S22-13: desconexión o aborto del cliente devuelve NETWORK_UNAVAILABLE sin reintentar", async t => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => {
    requests++;
    if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    throw new TypeError("fetch failed");
  });
  const aborted = new AbortController();
  aborted.abort();
  const readResult = await readApi("/api/demo/session", success, aborted.signal);
  assert.equal(readResult.ok, false);
  if (!readResult.ok) assert.equal(readResult.error.code, "NETWORK_UNAVAILABLE");

  const mutationResult = await postOperation("/api/demo/runs", "{}", success, [200, 201], aborted.signal);
  assert.equal(mutationResult.ok, false);
  if (!mutationResult.ok) {
    assert.equal(mutationResult.error.status, null);
    assert.equal(mutationResult.error.code, "NETWORK_UNAVAILABLE");
  }
  assert.equal(requests, 2);
});

test("S22-18: transportes de mutación envían X-CSRF-Token y readApi captura el token de la respuesta", async t => {
  clearCsrfToken();
  const sentHeaders: Headers[] = [];
  t.mock.method(globalThis, "fetch", async (input: unknown, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    sentHeaders.push(headers);
    if (String(input) === "/api/demo/session") {
      return new Response(JSON.stringify({ session: { expiresAt: "2026-01-01T00:00:00.000Z", runCount: 0, remainingRuns: 3 }, activeRun: null, csrfToken: "csrf-token-xyz" }), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-CSRF-Token": "csrf-token-xyz" },
      });
    }
    return new Response(JSON.stringify({ saved: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  const signal = new AbortController().signal;

  // Antes de obtener token, mutaciones envían cadena vacía
  await postDemoRequest("{}", signal);
  assert.equal(sentHeaders[0]?.get("x-csrf-token"), "");

  // readApi recupera la sesión y captura el CSRF token de la respuesta
  const readResult = await readApi("/api/demo/session", sessionSuccess, signal);
  assert.equal(readResult.ok, true);
  assert.equal(getCsrfToken(), "csrf-token-xyz");

  // Mutaciones posteriores envían automáticamente el token capturado
  await postOperation("/api/demo/session", "{}", success, [200, 201], signal);
  assert.equal(sentHeaders[2]?.get("x-csrf-token"), "csrf-token-xyz");

  await postDemoRequest("{}", signal);
  assert.equal(sentHeaders[3]?.get("x-csrf-token"), "csrf-token-xyz");

  // Override explícito respeta el valor aportado
  await postOperation("/api/demo/session", "{}", success, [200, 201], signal, "csrf-override");
  assert.equal(sentHeaders[4]?.get("x-csrf-token"), "csrf-override");

  clearCsrfToken();
});

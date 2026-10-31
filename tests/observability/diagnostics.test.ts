import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { z } from "zod";
import { shouldLogHttp } from "../../src/server/diagnostics";

test("S22-08: las traducciones reales del SDK conservan causa privada sin agregarla al resultado JSON", { timeout: 20000 }, async () => {
  const { readOperator, readSignedTransaction, sendFailure } = await import("../../src/server/hedera/sdk");
  const { HcsError, hcsCause } = await import("../../src/server/hedera/contracts");
  const cause = new Error("synthetic-private-provider-message");
  const outcome = sendFailure(cause);
  assert.equal(hcsCause(outcome), cause);
  assert.deepEqual(JSON.parse(JSON.stringify(outcome)), { kind: "unknown", code: "HCS_RESULT_UNKNOWN" });
  const operator = readOperator({ HEDERA_OPERATOR_ID: "0.0.17", HEDERA_OPERATOR_KEY: "302e020100300506032b657004220420" + "11".repeat(32) });
  assert.throws(() => readSignedTransaction(new Uint8Array(), "invalid", "invalid", operator.key.publicKey), error => error instanceof HcsError && error.code === "HCS_INVALID_PREPARATION" && error.cause instanceof Error);
});

test("S22-08: 5xx no se muestrean; 4xx usan 1/16 de las referencias internas", () => {
  const sampled = "00000000-0000-4000-8000-000000000000", omitted = "00000000-0000-4000-8000-000000000001";
  for (const status of [400, 401, 403, 404, 409, 422, 429]) {
    assert.equal(shouldLogHttp(status, sampled), true);
    assert.equal(shouldLogHttp(status, omitted), false);
  }
  for (const status of [200, 201, 500, 502, 503, 504]) assert.equal(shouldLogHttp(status, omitted), true);
});

test("S22-08: perder el colector stderr no cambia stdout ni derriba el proceso", { timeout: 20000 }, async () => {
  const child = spawn(process.execPath, ["--import", "tsx", "tests/observability/export-fixture.ts"], {
    env: { ...process.env, NODE_ENV: "test", DIAGNOSTIC_SECRET_MARKER: "synthetic-not-a-real-secret" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  const closed = once(child, "close");
  let stdout = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.destroy();
  const [code] = await closed;
  assert.equal(code, 0);
  assert.equal(stdout, "FUNCTIONAL_STDOUT\n");
});

test("S22-08/09: el exportador real a stderr redacta, acota causas y aísla contextos asíncronos", () => {
  const marker = `PRIVATE-${randomUUID()}-person@example.invalid`;
  const result = spawnSync(process.execPath, ["--import", "tsx", "tests/observability/export-fixture.ts"], {
    env: { ...process.env, NODE_ENV: "test", DIAGNOSTIC_SECRET_MARKER: marker }, windowsHide: true, encoding: "utf8", timeout: 20000, maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "FUNCTIONAL_STDOUT\n");
  for (const secret of [marker, "private-owner", "private-token", '"query"', '"parameters"', '"cookie"', '"password"', '"authorization"', '"signedBytes"']) assert.ok(!result.stderr.includes(secret), secret);
  const schema = z.object({ requestId: z.uuid(), traceId: z.string().regex(/^[a-f0-9]{32}$/), spanId: z.string().regex(/^[a-f0-9]{16}$/), parentSpanId: z.string().nullable(), "event.name": z.string(), severity: z.string(), businessTraceId: z.uuid(), route: z.literal("/api/demo/runs/:traceId/commands"), durationMs: z.number().nonnegative(), "service.name": z.literal("jopoi"), "service.version": z.string(), environment: z.literal("test"), error: z.array(z.object({ type: z.string(), code: z.string().nullable(), frames: z.array(z.string()) })).optional() });
  const rows = result.stderr.trim().split("\n").map(line => {
    assert.ok(Buffer.byteLength(line) <= 8192);
    return schema.parse(JSON.parse(line));
  });
  assert.equal(rows.length, 72);
  const requests = new Set(rows.map(row => row.requestId));
  assert.equal(requests.size, 24);
  assert.equal(new Set(rows.map(row => row.traceId)).size, 24);
  for (const requestId of requests) {
    const related = rows.filter(row => row.requestId === requestId);
    assert.equal(related.length, 3);
    assert.equal(new Set(related.map(row => row.traceId)).size, 1);
    const root = related.find(row => row["event.name"] === "http.completed");
    assert.ok(root);
    assert.equal(root.severity, "ERROR");
    assert.equal(root.parentSpanId, null);
    assert.ok(root.error?.some(error => error.code === "ECONNREFUSED"));
    assert.ok(root.error?.some(error => error.code === "23514"));
    assert.ok(root.error?.some(error => error.frames.includes("src/server/database/index.ts:35:5")));
    assert.ok((root.error?.length ?? 0) <= 6);
    assert.equal(related.filter(row => row.severity === "ERROR").length, 1);
    for (const child of related.filter(row => row !== root)) {
      assert.equal(child.parentSpanId, root.spanId);
      assert.notEqual(child.spanId, root.spanId);
    }
  }
});

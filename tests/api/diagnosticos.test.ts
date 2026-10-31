import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeEach, expect, test } from "vitest";
import { z } from "zod";
import { environment, eventually, Visitor } from "../support/client";
import { exceptional } from "../support/fixtures";
import { requiredEntry } from "../support/required-entry";

beforeEach(() => environment.reset());
afterAll(() => environment.close());
const recordSchema = z.object({
  timestamp: z.iso.datetime(), severity: z.enum(["INFO", "WARN", "ERROR"]), "service.name": z.literal("jopoi"), "service.version": z.string(), environment: z.string(),
  "event.name": z.string(), requestId: z.uuid(), traceId: z.string().regex(/^[a-f0-9]{32}$/), spanId: z.string().regex(/^[a-f0-9]{16}$/), parentSpanId: z.string().nullable(),
  businessTraceId: z.uuid().nullable(), route: z.string(), operation: z.string(), code: z.string(), durationMs: z.number().nonnegative(),
  status: z.number().optional(), error: z.array(z.object({ type: z.string(), code: z.string().nullable(), frames: z.array(z.string()) })).optional(),
});
async function collected(requestId: string) {
  // Colector del transporte real stderr: no se reemplazan ni espían funciones del logger.
  const raw = await readFile(resolve(environment.resources.directory, "next.log"), "utf8");
  return raw.split("\n").filter(line => line.startsWith("{") && line.includes(requestId)).map(line => recordSchema.parse(JSON.parse(line)));
}
async function terminal(requestId: string) {
  const rows = await eventually(() => collected(requestId), rows => rows.some(row => row["event.name"] === "http.completed"), "DIAGNOSTIC_HTTP_RESULT");
  const row = rows.find(row => row["event.name"] === "http.completed");
  if (!row) throw new Error("HTTP_DIAGNOSTIC_MISSING");
  return { row, rows };
}
function reference(headers: Headers) {
  const requestId = headers.get("x-request-id");
  if (!requestId) throw new Error("PUBLIC_REFERENCE_MISSING");
  return requestId;
}
function privateValuesAbsent(value: unknown, extra: string[] = []) {
  const exported = JSON.stringify(value);
  for (const marker of ["S17_INJECTED_COMMIT_FAILURE", "person@example.invalid", "private-password", "private-signed-bytes", "Authorization", "Bearer ", "postgresql://", "signedTransactionBytes", "Cookie", ...extra]) expect(exported).not.toContain(marker);
}

test("S22-08 · SQL inesperado y dependencia caída son investigables sin exportar mensajes ni conexiones", async () => {
  const visitor = await new Visitor().setup();
  const forged = randomUUID();
  await exceptional.failEventCommit();
  try {
    const result = await visitor.post(`/api/demo/runs/${visitor.traceId}/commands`, {
      requestId: forged, expectedVersion: 1, action: "publish", role: "generator", quantityKg: "12000", humidityPercent: "28",
    }, { "X-Request-Id": forged, traceparent: "00-11111111111111111111111111111111-2222222222222222-01", tracestate: "private=private-password" });
    expect(result.status).toBe(500);
    const requestId = reference(result.headers);
    expect(requestId).not.toBe(forged);
    expect(result.body).toMatchObject({ error: { code: "INTERNAL_ERROR", requestId } });
    const { row, rows } = await terminal(requestId);
    expect(rows.filter(row => row.severity === "ERROR")).toHaveLength(1);
    expect(row).toMatchObject({ code: "INTERNAL_ERROR", route: "/api/demo/runs/:traceId/commands", businessTraceId: visitor.traceId, parentSpanId: null });
    expect(row.traceId).not.toBe("11111111111111111111111111111111");
    expect(row.error?.some(cause => cause.type.startsWith("Prisma") || cause.code !== null || cause.frames.length > 0)).toBe(true);
    expect(rows.some(row => row.operation === "database.transaction" && row.parentSpanId !== null)).toBe(true);
    privateValuesAbsent({ result: result.body, rows }, [visitor.cookie, environment.resources.databaseUrl]);
  } finally { await exceptional.restoreEventCommit(); }
  await environment.database("stop");
  try {
    const unavailable = await visitor.get(`/api/demo/runs/${visitor.traceId}`);
    expect(unavailable.status).toBe(503);
    const { row, rows } = await terminal(reference(unavailable.headers));
    expect(row.code).toBe("DATABASE_UNAVAILABLE");
    expect((row.error?.length ?? 0)).toBeGreaterThanOrEqual(2);
    expect(rows.filter(row => row.severity === "ERROR")).toHaveLength(1);
    privateValuesAbsent(rows, [environment.resources.databaseUrl]);
  } finally { await environment.database("start"); }
});

test("S22-08 · fallo de programación tiene referencia y tipo útil, sin stack privado en HTTP", async () => {
  const visitor = await new Visitor().setup();
  const published = await visitor.publish();
  const eventId = published.applied.eventId;
  if (!eventId) throw new Error("PUBLISHED_EVENT_MISSING");
  await environment.network("malformed-verification");
  const result = await visitor.verification(eventId);
  expect(result.status).toBe(500);
  const requestId = reference(result.headers);
  expect(result.body).toMatchObject({ error: { code: "INTERNAL_ERROR", requestId } });
  const { row, rows } = await terminal(requestId);
  expect(row.error?.some(cause => cause.type === "TypeError")).toBe(true);
  expect(rows.filter(row => row.severity === "ERROR")).toHaveLength(1);
  expect(row.route).toBe("/api/traces/:traceId/events/:eventId/verification");
  expect(JSON.stringify(result.body)).not.toMatch(/stack|TypeError|evidence|src\/server/);
  privateValuesAbsent(rows, [visitor.cookie]);
});

test("S22-09 · commit, after y SQL conservan relación; cron crea una raíz independiente", async () => {
  const visitor = await new Visitor().setup();
  const published = await visitor.command({ action: "publish", role: "generator", quantityKg: "12000", humidityPercent: "28" });
  expect(published.status).toBe(200);
  const requestId = reference(published.headers);
  const rows = await eventually(() => collected(requestId), rows => rows.some(row => row["event.name"] === "background.completed"), "PUBLICATION_DIAGNOSTIC", 60000);
  const root = rows.find(row => row["event.name"] === "http.completed");
  const worker = rows.find(row => row["event.name"] === "background.completed");
  expect(root).toBeDefined(); expect(worker).toBeDefined();
  if (!root || !worker) throw new Error("PUBLICATION_CONTEXT_MISSING");
  expect(rows.filter(row => row["event.name"] === "operation.committed")).toHaveLength(1);
  expect(worker.parentSpanId).toBe(root.spanId);
  expect(worker.traceId).toBe(root.traceId);
  expect(worker.businessTraceId).toBe(visitor.traceId);
  expect(rows.some(row => row.operation === "database.transaction" && row.parentSpanId === worker.spanId)).toBe(true);
  expect(new Set(rows.map(row => row.traceId)).size).toBe(1);
  const cron = await environment.cron();
  expect(cron.status).toBe(200);
  const cronRows = await terminal(reference(cron.headers));
  expect(cronRows.row.parentSpanId).toBe(null);
  expect(cronRows.row.traceId).not.toBe(root.traceId);
  expect(cronRows.row.requestId).not.toBe(root.requestId);
  expect(cronRows.rows.some(row => row["event.name"] === "maintenance.completed")).toBe(true);
  const rejection = await new Visitor().get("/api/demo/session");
  expect(rejection.status).toBe(401);
  expect((await collected(reference(rejection.headers))).every(row => row.severity !== "ERROR")).toBe(true);
  privateValuesAbsent([...rows, ...cronRows.rows], [visitor.cookie]);
  expect(requiredEntry(rows).requestId).toBe(requestId);
});

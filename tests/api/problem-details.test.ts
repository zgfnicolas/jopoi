import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, test } from "vitest";
import { environment, Visitor } from "../support/client";
import { exceptional } from "../support/fixtures";
import { API_ACCEPT, problemDetailsSchema } from "../../src/shared/problem-details";

beforeEach(() => environment.reset());
afterAll(() => environment.close());

test("S22-12 · cliente anterior y nuevo reciben el mismo rechazo y una referencia segura", async () => {
  const visitor = new Visitor();
  const legacy = await visitor.request<unknown>("GET", "/api/demo/session", undefined, { Accept: "application/json" });
  expect(legacy.status).toBe(401);
  expect(legacy.headers.get("content-type")).toContain("application/json");
  expect(legacy.body).toMatchObject({ error: { code: "SESSION_REQUIRED" } });
  const modern = await visitor.request<unknown>("GET", "/api/demo/session", undefined, { Accept: API_ACCEPT });
  expect(modern.status).toBe(401);
  expect(modern.headers.get("content-type")).toBe("application/problem+json");
  const problem = problemDetailsSchema.parse(modern.body);
  expect(problem.code).toBe("SESSION_REQUIRED");
  expect(problem.requestId).toBe(modern.headers.get("x-request-id"));
  expect(modern.headers.get("vary")).toContain("Accept");
});

test("S22-12 · validación no repite valores, 429 publica su plazo y reintento conserva intención", async () => {
  const visitor = new Visitor();
  const headers = { Accept: API_ACCEPT };
  const invalid = await visitor.post<unknown>("/api/demo-requests", { requestId: randomUUID(), name: "PRIVATE\nPERSON", email: "PRIVATE", company: "Empresa" }, headers);
  expect(invalid.status).toBe(400);
  const detail = problemDetailsSchema.parse(invalid.body);
  expect(detail.fields).toHaveProperty("email");
  expect(JSON.stringify(invalid.body)).not.toContain("PRIVATE");
  const input = { requestId: randomUUID(), name: "Persona sintética", email: "s22@example.invalid", company: "Empresa sintética" };
  for (let i = 0; i < 5; i++) expect((await visitor.post("/api/demo-requests", input, headers)).status).toBe(i === 0 ? 201 : 200);
  const rejected = await visitor.post<unknown>("/api/demo-requests", input, headers);
  expect(rejected.status).toBe(429);
  expect(problemDetailsSchema.parse(rejected.body).code).toBe("RATE_LIMITED");
  expect(Number(rejected.headers.get("retry-after"))).toBeGreaterThan(0);
  await environment.clock("2026-01-01T13:00:01.000Z");
  expect((await visitor.post("/api/demo-requests", input, headers)).status).toBe(200);
});

test("S22-08/12 · SQL inesperado y dependencia indisponible usan Problem Details seguro", async () => {
  const visitor = await new Visitor().setup();
  await exceptional.failEventCommit();
  try {
    const response = await visitor.post<unknown>(`/api/demo/runs/${visitor.traceId}/commands`, { requestId: randomUUID(), expectedVersion: 1, action: "publish", role: "generator", quantityKg: "12000", humidityPercent: "28" }, { Accept: API_ACCEPT });
    expect(response.status).toBe(500);
    expect(problemDetailsSchema.parse(response.body).code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(response.body)).not.toMatch(/PRIVATE|S17_INJECTED|Prisma|stack|postgresql|person@example/);
  } finally { await exceptional.restoreEventCommit(); }
  await environment.database("stop");
  try {
    const result = await visitor.request<unknown>("GET", `/api/demo/runs/${visitor.traceId}`, undefined, { Accept: API_ACCEPT });
    expect(result.status).toBe(503);
    expect(problemDetailsSchema.parse(result.body).code).toBe("DATABASE_UNAVAILABLE");
    expect(result.headers.has("retry-after")).toBe(false); // No se conoce cuándo volverá PostgreSQL.
  } finally { await environment.database("start"); }
});

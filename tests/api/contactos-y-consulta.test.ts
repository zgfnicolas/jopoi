import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, test } from "vitest";
import type { DemoRequestConfirmation } from "../../src/shared/contact-contracts";
import type { DemoSessionResponse } from "../../src/shared/session-contracts";
import { environment, eventually, Visitor } from "../support/client";

beforeEach(() => environment.reset());
afterAll(() => environment.close());
const day = 86400000;
const contact = (name: string) => ({ requestId: randomUUID(), name, email: "synthetic@example.invalid", company: "Empresa sintética S17" });

test("API-21 · vencimiento exacto y limpieza preservan recorridos y contactos vigentes", async () => {
  const expired = await new Visitor().setup();
  await expired.publish();
  await environment.advance(7 * day - 1);
  expect((await expired.trace()).status).toBe(200);
  await environment.advance(1);
  expect((await expired.trace()).status).toBe(410);
  const active = await new Visitor().setup();
  await active.publish();
  expect((await environment.cron()).status).toBe(200);
  expect((await expired.trace()).status).toBe(404);
  expect((await active.trace()).status).toBe(200);

  const visitor = new Visitor();
  const old = contact("Contacto vencido S17");
  expect((await visitor.post("/api/demo-requests", old)).status).toBe(201);
  await environment.advance(90 * day - 1);
  expect((await visitor.post("/api/demo-requests", old)).status).toBe(200);
  await environment.advance(1);
  expect((await visitor.post("/api/demo-requests", old)).status).toBe(410);
  const fresh = contact("Contacto vigente S17");
  const freshResult = await visitor.post<DemoRequestConfirmation>("/api/demo-requests", fresh);
  expect(freshResult.status).toBe(201);
  const current = await new Visitor().setup();
  await current.publish();
  expect((await environment.cron()).status).toBe(200);
  expect((await current.trace()).status).toBe(200);
  const csv = await environment.exportContacts();
  expect(csv).toContain("Contacto vigente S17");
  expect(csv).not.toContain("Contacto vencido S17");
  expect((await visitor.post<DemoRequestConfirmation>("/api/demo-requests", fresh)).body.id).toBe(freshResult.body.id);
  // A new 201 for the expired request ID proves physical deletion through the public API.
  expect((await visitor.post("/api/demo-requests", old)).status).toBe(201);
});

test("API-22 · contacto idempotente persistido y CSV escapado sin ejecutar fórmulas", async () => {
  const visitor = new Visitor();
  const input = { ...contact("=2+2"), company: 'Empresa "Demo";', message: 'Hola "demo";\nlínea dos' };
  const results = await Promise.all([visitor.post<DemoRequestConfirmation>("/api/demo-requests", input), visitor.post<DemoRequestConfirmation>("/api/demo-requests", input)]);
  expect(results.map(result => result.status).sort()).toEqual([200, 201]);
  expect(results[0].body).toEqual(results[1].body);
  expect(results[0].body.message).toBe("Tu solicitud para conocer el prototipo quedó guardada.");
  expect((await visitor.post("/api/demo-requests", { ...input, company: "otra" })).status).toBe(409);
  for (const invalid of [{ ...input, requestId: randomUUID(), email: "incorrecto" }, { ...input, requestId: randomUUID(), name: "" },
    { ...input, requestId: randomUUID(), message: "x".repeat(2001) }, { ...input, requestId: randomUUID(), extra: true }]) {
    expect((await visitor.post("/api/demo-requests", invalid)).status).toBe(400);
  }
  for (const formula of ["+1", "-1", "@SUM(1)", "＝1+1", "＋1", "－1", "＠SUM(1)"]) {
    expect((await visitor.post("/api/demo-requests", { ...contact("Fórmula sintética"), message: formula })).status).toBe(201);
  }
  await environment.restart();
  expect((await visitor.post<DemoRequestConfirmation>("/api/demo-requests", input)).body.id).toBe(results[0].body.id);
  const csv = await environment.exportContacts();
  expect(csv.startsWith('\uFEFF"fecha_solicitud";"nombre";"email";"empresa";"mensaje"\r\n')).toBe(true);
  expect(csv).toContain('"\t=2+2";"synthetic@example.invalid";"Empresa ""Demo"";";"Hola ""demo"";\nlínea dos"\r\n');
  for (const formula of ["+1", "-1", "@SUM(1)", "＝1+1", "＋1", "－1", "＠SUM(1)"]) expect(csv).toContain(`"\t${formula}"`);
  expect(await environment.exportContacts()).toBe(csv);
});

test("API-23 · DTO y errores públicos excluyen contactos, credenciales y atributos internos", async () => {
  const owner = await new Visitor().setup();
  await owner.post("/api/demo-requests", { ...contact("PERSONA_PRIVADA_S17"), message: "CONTACTO_PRIVADO_S17" });
  const published = await owner.publish();
  const anonymous = new Visitor();
  const trace = await anonymous.get(`/api/traces/${owner.traceId}`);
  const verification = await owner.verification(published.applied.eventId!);
  const invalid = await anonymous.get("/api/traces/no-es-uuid");
  const unauthorized = await anonymous.get(`/api/demo/runs/${owner.traceId}`);
  expect(trace.status).toBe(200);
  expect(invalid.status).toBe(400);
  expect(unauthorized.status).toBe(401);
  expect(Object.keys(trace.body).sort()).toEqual(["version", "demo", "network", "traceId", "expiresAt", "state", "scenario", "declaration", "reception", "events"].sort());
  const combined = JSON.stringify([trace.body, verification.body, invalid.body, unauthorized.body]);
  for (const marker of ["PERSONA_PRIVADA_S17", "CONTACTO_PRIVADO_S17", "synthetic@example.invalid", owner.cookie.split("=")[1], environment.env.SESSION_SECRET!, environment.env.HEDERA_OPERATOR_KEY!]) {
    expect(combined).not.toContain(marker);
  }
  const forbidden = new Set(["sessionId", "token", "tokenHash", "signedTransactionBytes", "signedBytes", "attemptHistory", "leaseOwner", "leaseExpiresAt", "configurationGeneration", "hcsConfigurationGeneration", "intentHash", "email"]);
  function check(value: unknown) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) { expect(forbidden.has(key), `private key ${key}`).toBe(false); check(child); }
  }
  check([trace.body, verification.body, invalid.body, unauthorized.body]);
  expect(verification.headers.get("cache-control")).toContain("no-store");
});

test("API-24 · 12000 kg conserva los importes ilustrativos de S02", async () => {
  const visitor = await new Visitor().setup();
  expect((await visitor.run()).economics).toMatchObject({ currency: "ARS", isIllustrative: true,
    quantityKg: "12000.000", materialCost: "216000.00", jopoiTotal: "324000.00", alternativeTotal: "381000.00", difference: "57000.00", differenceKind: "saving" });
});

test("API-25 · red suspendida y cambio de topic no reescriben evidencia histórica", async () => {
  const visitor = await new Visitor().setup();
  const published = await visitor.publish();
  const initial = (await visitor.trace()).body.events[0];
  await environment.network("suspended");
  await environment.restart({ HEDERA_TOPIC_ID: "0.0.171" });
  const unavailable = await visitor.verification(published.applied.eventId!);
  expect(unavailable.body).toMatchObject({ network: "testnet", state: "UNAVAILABLE", publication: { state: "CONFIRMED", topicId: "0.0.170" }, storedVerification: { state: "MATCHED" } });
  await visitor.apply({ action: "approve", role: "coordinator" });
  const paused = await eventually(() => visitor.run(), run => run.events[1]?.publication.state === "PAUSED_CONFIG");
  expect(paused.events[1].publication.lastErrorCode).toBe("HCS_CONFIG_CHANGED");
  expect((await visitor.trace()).body.events[0]).toEqual(initial);
  expect((await environment.ledger()).submissions).toHaveLength(1);
});

test("API-26 · consultar enlace QR e historial no consume recorridos ni publica mensajes", async () => {
  const owner = await new Visitor().setup();
  const published = await owner.publish();
  const before = await owner.run();
  const anonymous = new Visitor();
  for (let index = 0; index < 3; index++) {
    expect((await anonymous.get(`/api/traces/${owner.traceId}`)).status).toBe(200);
    anonymous.traceId = owner.traceId;
    expect((await anonymous.verification(published.applied.eventId!)).status).toBe(200);
  }
  const page = await fetch(environment.origin + `/trazabilidad/${owner.traceId}`);
  expect(page.status).toBe(200);
  await page.text();
  expect((await owner.get<DemoSessionResponse>("/api/demo/session")).body.session.runCount).toBe(1);
  const after = await owner.run();
  expect(after.version).toBe(before.version);
  expect(after.quota).toEqual(before.quota);
  expect(after.events.map(event => event.event)).toEqual(before.events.map(event => event.event));
  expect((await environment.ledger()).submissions).toHaveLength(1);
  expect(anonymous.cookie).toBe("");
});

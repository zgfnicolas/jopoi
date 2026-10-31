import { requiredEntry } from "../support/required-entry";
import { afterAll, beforeEach, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { environment, eventually, Visitor } from "../support/client";
import type { DemoSessionResponse } from "../../src/shared/session-contracts";
import { exceptional } from "../support/fixtures";

// Each case receives a clean SQL state and a fresh HTTP server.
beforeEach(() => environment.reset());
afterAll(() => environment.close());

test("API-01 · recuperar y recargar conserva el recorrido y su cupo", async () => {
  const visitor = new Visitor();
  const begun = await visitor.begin();
  expect(begun.headers.get("set-cookie")).toMatch(/HttpOnly/i);
  expect(begun.headers.get("set-cookie")).toMatch(/SameSite=lax/i);
  expect(begun.body.activeRun).toBeNull();
  const first = await visitor.start();
  expect(first.session.runCount).toBe(1);
  const recovered = await visitor.get<DemoSessionResponse>("/api/demo/session");
  expect(recovered.status).toBe(200);
  expect(recovered.body.activeRun?.traceId).toBe(first.run.traceId);
  const resumed = await visitor.start();
  expect(resumed.run.traceId).toBe(first.run.traceId);
  expect(resumed.session.runCount).toBe(1);
});

test("API-02 · solicitudes concurrentes nunca superan tres recorridos", async () => {
  const visitor = await new Visitor().setup();
  const results = await Promise.all(Array.from({ length: 8 }, () => visitor.post("/api/demo/runs/reset", { requestId: randomUUID() })));
  expect(results.every(result => [201, 409, 429].includes(result.status))).toBe(true);
  const session = await visitor.get<DemoSessionResponse>("/api/demo/session");
  expect(session.body.session.runCount).toBeLessThanOrEqual(3);
  expect(session.body.session.runCount).toBe(1 + results.filter(result => result.status === 201).length);
  for (let count = session.body.session.runCount; count < 3; count++) await visitor.start(true);
  const denied = await visitor.post("/api/demo/runs/reset", { requestId: randomUUID() });
  expect(denied.status).toBe(429);
  expect(denied.body).toMatchObject({ error: { code: "RUN_LIMIT_REACHED" } });
});

test("API-03 · otra sesión y otro origen no acceden ni modifican datos privados", async () => {
  const owner = await new Visitor().setup();
  const stranger = await new Visitor().setup();
  expect((await stranger.get(`/api/demo/runs/${owner.traceId}`)).status).toBe(404);
  const command = { action: "publish", role: "generator", quantityKg: "12000", humidityPercent: "28", requestId: randomUUID(), expectedVersion: 1 };
  expect((await stranger.post(`/api/demo/runs/${owner.traceId}/commands`, command)).status).toBe(404);
  expect((await owner.post(`/api/demo/runs/${owner.traceId}/commands`, command, { Origin: "https://otro.example" })).status).toBe(403);
  expect((await owner.run()).version).toBe(1);
  expect((await owner.run()).events).toEqual([]);
});

test("API-04 · a las 24 horas vence la escritura pero continúa la trazabilidad pública", async () => {
  const visitor = await new Visitor().setup();
  await visitor.publish();
  await eventually(() => visitor.run(), run => run.events[0]?.publication.verificationState === "MATCHED");
  await environment.advance(86400000 - 1);
  expect((await visitor.get(`/api/demo/runs/${visitor.traceId}`)).status).toBe(200);
  await environment.advance(1);
  const expired = await visitor.post(`/api/demo/runs/${visitor.traceId}/commands`, { action: "approve", role: "coordinator", requestId: randomUUID(), expectedVersion: 2 });
  expect(expired.status).toBe(401);
  expect(expired.body).toMatchObject({ error: { code: "SESSION_EXPIRED" } });
  expect((await new Visitor().get(`/api/traces/${visitor.traceId}`)).status).toBe(200);
});

test("API-05 · declaraciones inválidas no cambian versión, estado ni historial", async () => {
  const visitor = await new Visitor().setup();
  for (const [quantityKg, humidityPercent, status, code] of [
    ["0", "28", 422, "RULE_VIOLATION"], ["-1", "28", 400, "INVALID_INPUT"], ["1.0001", "28", 400, "INVALID_INPUT"],
    ["12000", "-0.01", 400, "INVALID_INPUT"], ["12000", "100.01", 422, "RULE_VIOLATION"], ["12000", "28.001", 400, "INVALID_INPUT"],
  ] as const) {
    const result = await visitor.command({ action: "publish", role: "generator", quantityKg, humidityPercent });
    expect(result.status).toBe(status);
    expect(result.body).toMatchObject({ error: { code } });
  }
  expect(await visitor.run()).toMatchObject({ version: 1, operation: { state: "DRAFT", quantityKg: "12000.000", humidityPercent: "28.00" }, events: [] });
});

test("API-06 · guardar no publica y publicar crea un solo hito inmutable", async () => {
  const visitor = await new Visitor().setup();
  const saved = await visitor.apply({ action: "save", role: "generator", quantityKg: "12000", humidityPercent: "30" });
  expect(saved).toMatchObject({ saved: true, event: null, publication: null });
  expect((await visitor.run()).events).toEqual([]);
  expect((await environment.ledger()).submissions).toEqual([]);
  const requestId = randomUUID();
  const command = { action: "publish", role: "generator", quantityKg: "12000", humidityPercent: "30", expectedVersion: 2, requestId };
  const published = await visitor.post(`/api/demo/runs/${visitor.traceId}/commands`, command);
  expect(published.status).toBe(200);
  const settled = await eventually(() => visitor.run(), run => run.events[0]?.publication.verificationState === "MATCHED");
  const replayed = await visitor.post(`/api/demo/runs/${visitor.traceId}/commands`, command);
  expect(replayed.body).toMatchObject({ replayed: true, applied: { eventId: published.body.applied.eventId } });
  expect(settled.events).toHaveLength(1);
  expect(requiredEntry(settled.events, 0).event).toEqual(published.body.event);
  expect((await environment.ledger()).submissions).toHaveLength(1);
});

test("API-07 · 35% permite aprobar y 35,01% exige rechazar con motivo", async () => {
  const accepted = await new Visitor().setup();
  await accepted.publish("12000", "35");
  expect((await accepted.apply({ action: "approve", role: "coordinator" })).current.operation.state).toBe("APPROVED");
  const rejected = await new Visitor().setup();
  await rejected.publish("12000", "35.01");
  expect((await rejected.command({ action: "approve", role: "coordinator" })).status).toBe(422);
  expect((await rejected.command({ action: "reject", role: "coordinator", reasonCode: "inventado" })).status).toBe(400);
  const result = await rejected.apply({ action: "reject", role: "coordinator", reasonCode: "HUMIDITY_ABOVE_LIMIT" });
  expect(result.current.operation).toMatchObject({ state: "REJECTED", humidityPercent: "35.01", rejectionReasonCode: "HUMIDITY_ABOVE_LIMIT" });
});

test("API-08 · cada condición incompatible bloquea asignación y puede no haber viajes", async () => {
  const alterations = [
    { acceptedMaterialIds: ["otro-material"] }, { availableCapacityKg: "11999.999" },
    { bodyType: "ENCLOSED_VAN" }, { routeCompatible: false },
    { pickupWindow: { dayOffset: 0, startMinute: 600, endMinute: 660, utcOffset: "-03:00" } },
  ];
  const conditions = ["MATERIAL", "CAPACITY", "BODY_TYPE", "ROUTE", "PICKUP_WINDOW"];
  for (const [index, alteration] of alterations.entries()) {
    const visitor = await new Visitor().setup();
    const scenario = structuredClone((await visitor.run()).scenario);
    const modified = { ...scenario, trips: scenario.trips.map(trip => trip.id === "return-a" ? { ...trip, ...alteration } : trip) };
    await exceptional.snapshot(visitor.traceId, modified);
    await visitor.publish();
    await visitor.apply({ action: "approve", role: "coordinator" });
    const before = await visitor.run();
    const trip = before.compatibility.find(trip => trip.tripId === "return-a")!;
    expect(trip.checks.filter(check => !check.isCompatible).map(check => check.code)).toEqual([conditions[index]]);
    expect((await visitor.command({ action: "assign", role: "coordinator", tripId: "return-a" })).status).toBe(422);
    expect((await visitor.run()).version).toBe(before.version);
  }
  const excessive = await new Visitor().setup();
  await excessive.publish("18000.001");
  expect((await excessive.run()).compatibility.every(trip => !trip.isCompatible)).toBe(true);
});

test("API-09 · recepción exactamente igual cierra conforme y preserva la declaración", async () => {
  const visitor = await new Visitor().setup();
  await visitor.pickup();
  const result = await visitor.apply({ action: "receive", role: "buyer", receivedKg: "12000.000" });
  expect(result.current.operation).toMatchObject({ state: "RECEIVED", quantityKg: "12000.000", receivedKg: "12000.000" });
  const trace = await visitor.trace();
  expect(trace.body.declaration?.quantityKg).toBe("12000.000");
  expect(trace.body.reception).toMatchObject({ outcome: "RECEIVED", receivedKg: "12000.000" });
  expect(trace.body.events.map(event => event.type)).toEqual(["LOT_PUBLISHED", "LOT_APPROVED", "TRANSPORT_ASSIGNED", "PICKUP_CONFIRMED", "RECEIPT_ACCEPTED"]);
});

test("API-10 · diferencia de peso exige incidencia y material admite pesos iguales", async () => {
  const visitor = await new Visitor().setup();
  await visitor.pickup();
  for (const [receivedKg, status] of [["0", 422], ["-1", 400], ["12000.0001", 400]] as const) {
    expect((await visitor.command({ action: "receive", role: "buyer", receivedKg })).status).toBe(status);
  }
  expect(await visitor.run()).toMatchObject({ version: 5, operation: { state: "PICKED_UP", receivedKg: null } });
  expect((await visitor.command({ action: "receive", role: "buyer", receivedKg: "11999.999" })).status).toBe(422);
  const incident = await visitor.apply({ action: "incident", role: "buyer", receivedKg: "11999.999", reasonCode: "WEIGHT_MISMATCH" });
  expect(incident.current.operation).toMatchObject({ state: "INCIDENT", quantityKg: "12000.000", receivedKg: "11999.999", incidentReasonCode: "WEIGHT_MISMATCH" });
  const equal = await new Visitor().setup();
  await equal.pickup();
  expect((await equal.command({ action: "incident", role: "buyer", receivedKg: "12000", reasonCode: "WEIGHT_MISMATCH" })).status).toBe(422);
  expect((await equal.apply({ action: "incident", role: "buyer", receivedKg: "12000", reasonCode: "MATERIAL_ISSUE" })).current.operation.state).toBe("INCIDENT");
});

test("API-11 · roles, transiciones y estados terminales preservan el historial", async () => {
  for (const terminal of ["RECEIVED", "REJECTED", "INCIDENT"]) {
    const visitor = await new Visitor().setup();
    expect((await visitor.command({ action: "publish", role: "buyer", quantityKg: "12000", humidityPercent: "28" })).status).toBe(403);
    expect((await visitor.command({ action: "pickup", role: "carrier" })).status).toBe(409);
    if (terminal === "REJECTED") {
      await visitor.publish();
      await visitor.apply({ action: "reject", role: "coordinator", reasonCode: "MATERIAL_NOT_AS_DECLARED" });
    } else {
      await visitor.pickup();
      await visitor.apply(terminal === "RECEIVED" ? { action: "receive", role: "buyer", receivedKg: "12000" }
        : { action: "incident", role: "buyer", receivedKg: "12000", reasonCode: "MATERIAL_ISSUE" });
    }
    const before = await visitor.run();
    expect(before.operation.state).toBe(terminal);
    expect((await visitor.command({ action: "save", role: "generator", quantityKg: "1", humidityPercent: "1" })).status).toBe(409);
    const after = await visitor.run();
    expect(after.version).toBe(before.version);
    expect(after.events.map(event => event.event)).toEqual(before.events.map(event => event.event));
  }
});

test("API-12 · intenciones concurrentes son idempotentes y versiones viejas dan conflicto", async () => {
  const visitor = await new Visitor().setup();
  const input = { action: "save", role: "generator", quantityKg: "12000", humidityPercent: "30", expectedVersion: 1, requestId: randomUUID() };
  const path = `/api/demo/runs/${visitor.traceId}/commands`;
  const same = await Promise.all([visitor.post(path, input), visitor.post(path, input)]);
  expect(same.map(result => result.status)).toEqual([200, 200]);
  expect(same.map(result => result.body.replayed).sort()).toEqual([false, true]);
  expect((await visitor.run()).version).toBe(2);
  expect((await visitor.post(path, { ...input, humidityPercent: "31" })).body).toMatchObject({ error: { code: "IDEMPOTENCY_CONFLICT" } });
  expect((await visitor.post(path, { ...input, requestId: randomUUID() })).body).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
  const competing = await Promise.all(["31", "32"].map(humidityPercent => visitor.post(path, { ...input, requestId: randomUUID(), expectedVersion: 2, humidityPercent })));
  expect(competing.map(result => result.status).sort()).toEqual([200, 409]);
  expect((await visitor.run()).version).toBe(3);
});

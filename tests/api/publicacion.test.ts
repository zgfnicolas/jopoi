import { requiredEntry } from "../support/required-entry";
import { afterAll, beforeEach, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { environment, eventually, Visitor } from "../support/client";
import { fixture } from "../support/fixtures";

beforeEach(() => environment.reset());
afterAll(() => environment.close());

test.each(["unknown", "timeout"] as const)("API-15 · %s conserva transactionId y las lecturas no reenvían", async mode => {
  await environment.network(mode);
  const visitor = await new Visitor().setup();
  const published = await visitor.publish();
  const eventId = published.applied.eventId!;
  const uncertain = await eventually(() => visitor.run(), run => run.events[0]?.publication.state === "UNCERTAIN");
  const transactionId = requiredEntry(uncertain.events, 0).publication.transactionId;
  expect(transactionId).toBeTruthy();
  for (let index = 0; index < 3; index++) { await visitor.trace(); await visitor.verification(eventId); await visitor.run(); }
  expect((await environment.ledger()).submissions).toEqual([transactionId]);
  expect((await visitor.retry(eventId)).body.outcome).toBe("RECONCILE_ONLY");
  expect(requiredEntry((await visitor.run()).events, 0).publication.transactionId).toBe(transactionId);
  await environment.network("confirmed");
  await environment.advance(60001);
  expect((await environment.cron()).status).toBe(200);
  const confirmed = await eventually(() => visitor.run(), run => run.events[0]?.publication.verificationState === "MATCHED");
  expect(requiredEntry(confirmed.events, 0).publication).toMatchObject({ state: "CONFIRMED", transactionId, automaticAttempts: 1 });
  expect((await environment.ledger()).submissions).toEqual([transactionId]);
});

test("API-17 · la cuota global limita un envío y conserva las acciones SQL", async () => {
  await environment.restart({ HCS_DAILY_LIMIT: "1" });
  const visitors: Visitor[] = [];
  for (let index = 0; index < 3; index++) {
    const visitor = await new Visitor().setup();
    visitors.push(visitor);
    expect((await visitor.command({ action: "publish", role: "generator", quantityKg: "12000", humidityPercent: "28" })).status).toBe(200);
  }
  // La capacidad externa (2 en vuelo) puede diferir un evento; el cron secuencial lo drena hasta PAUSED_QUOTA.
  await environment.advance(16000);
  expect((await environment.cron()).status).toBe(200);
  const runs = await eventually(() => Promise.all(visitors.map(visitor => visitor.run())), runs => runs.filter(run => run.events[0]?.publication.state === "PAUSED_QUOTA").length === 2);
  expect(runs.every(run => run.operation.state === "PUBLISHED" && run.events.length === 1 && run.quota.used === 1 && run.quota.remaining === 0)).toBe(true);
  expect((await environment.ledger()).submissions).toHaveLength(1);
});

test("API-19 · trabajadores solapados no duplican ni adelantan hitos", async () => {
  await environment.network("hold");
  const visitor = await new Visitor().setup();
  const first = await visitor.publish();
  await eventually(() => environment.ledger(), ledger => ledger.submissions.length === 1);
  const second = await visitor.apply({ action: "approve", role: "coordinator" });
  const before = await visitor.run();
  expect(requiredEntry(before.events, 1).publication.blockedBy).toBe(first.applied.eventId);
  const cron = await Promise.all([environment.cron(), environment.cron()]);
  expect(cron.some(result => result.status === 200)).toBe(true);
  for (const result of cron) {
    expect([200, 409]).toContain(result.status);
    if (result.status === 409) expect(result.body).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
  }
  expect((await environment.ledger()).messages.filter(message => message.submitted).map(message => message.envelope.eventId)).toEqual([first.applied.eventId]);
  await environment.network("confirmed", true);
  await eventually(() => visitor.run(), run => run.events.every(event => event.publication.verificationState === "MATCHED"));
  const ledger = await environment.ledger();
  expect(ledger.messages.filter(message => message.submitted).map(message => message.envelope.eventId)).toEqual([first.applied.eventId, second.applied.eventId]);
  expect(new Set(ledger.submissions).size).toBe(2);
  expect(ledger.submissions).toHaveLength(2);
});

test("API-20 · cron protegido recupera un lease abandonado sin reenviar la transacción", async () => {
  expect((await environment.cron("incorrecto")).status).toBe(401);
  expect((await new Visitor().get("/api/cron")).status).toBe(401);
  await environment.network("hold");
  const visitor = await new Visitor().setup();
  await visitor.publish();
  const external = await eventually(() => environment.ledger(), ledger => ledger.submissions.length === 1);
  const transactionId = external.submissions[0];
  await environment.close();
  await environment.network("confirmed", true);
  await environment.advance(90001);
  await environment.start();
  expect((await environment.cron()).status).toBe(200);
  expect(requiredEntry((await visitor.run()).events, 0).publication).toMatchObject({ state: "CONFIRMED", verificationState: "MATCHED", transactionId, automaticAttempts: 1 });
  expect((await environment.cron()).body).toMatchObject({ skipped: true });
  expect((await environment.ledger()).submissions).toEqual([transactionId]);
});

test("API-16 · receipt confirmado no inventa coincidencia y mirror alterado discrepa", async () => {
  await environment.network("mirror-lag");
  const visitor = await new Visitor().setup();
  const published = await visitor.publish();
  const eventId = published.applied.eventId!;
  await eventually(() => visitor.run(), run => run.events[0]?.publication.verificationState === "PENDING");
  const pending = await visitor.verification(eventId);
  expect(pending.body).toMatchObject({ state: "PENDING", publication: { state: "CONFIRMED" }, observation: { evidence: { digestMatch: false, remoteDigest: null } } });
  await environment.network("altered");
  expect((await visitor.verification(eventId)).body.state).toBe("MISMATCH");
  expect(requiredEntry((await visitor.trace()).body.events, 0).storedVerification.state).toBe("PENDING");
  await environment.advance(900001);
  expect((await environment.cron()).status).toBe(200);
  const mismatch = await visitor.trace();
  expect(requiredEntry(mismatch.body.events, 0).storedVerification.state).toBe("MISMATCH");
  expect(requiredEntry(mismatch.body.events, 0).event).toEqual(published.event);
});

test("API-18 · tres intentos automáticos y una reactivación manual sin reenvíos por lectura", async () => {
  await environment.network("rejected");
  const visitor = await new Visitor().setup();
  const published = await visitor.publish();
  const eventId = published.applied.eventId!;
  await eventually(() => visitor.run(), run => run.events[0]?.publication.state === "FAILED");
  await environment.advance(60001);
  expect((await environment.cron()).status).toBe(200);
  expect(requiredEntry((await visitor.run()).events, 0).publication.automaticAttempts).toBe(2);
  await environment.advance(300001);
  expect((await visitor.retry(eventId)).body.outcome).toBe("AUTOMATIC_PENDING");
  const exhausted = await eventually(() => visitor.run(), run => run.events[0]?.publication.automaticAttempts === 3 && requiredEntry(run.events, 0).publication.state === "FAILED");
  expect(requiredEntry(exhausted.events, 0).publication).toMatchObject({ manualAttempts: 0, manualAvailable: true });
  await visitor.verification(eventId);
  await visitor.trace();
  expect((await environment.ledger()).submissions).toHaveLength(3);
  const manualRequestId = randomUUID();
  const manual = await visitor.retry(eventId, manualRequestId);
  expect(manual.body.outcome).toBe("MANUAL_AUTHORIZED");
  await eventually(() => visitor.run(), run => run.events[0]?.publication.manualAttempts === 1 && requiredEntry(run.events, 0).publication.state === "FAILED");
  const replayed = await visitor.retry(eventId, manualRequestId);
  expect(replayed.status).toBe(200);
  expect(replayed.body).toMatchObject({ replayed: true, outcome: "MANUAL_AUTHORIZED" });
  expect((await visitor.retry(eventId)).body.outcome).toBe("EXHAUSTED");
  expect((await environment.ledger()).submissions).toHaveLength(4);
  expect(requiredEntry((await visitor.run()).events, 0).publication).toMatchObject({ automaticAttempts: 3, manualAttempts: 1, manualAvailable: false });
});

test("API-21 · capacidad externa global: saturación rechaza temprano sin tocar la red y recupera al liberar", async () => {
  // Dos permisos globales ocupados simulan dos llamadas costosas en vuelo de otras instancias.
  await fixture(`INSERT INTO "MaintenanceLease" (name, owner, "expiresAt") VALUES
    ('EXTERNAL_CAPACITY_0', '${randomUUID()}', '2026-01-01T12:01:00.000Z'),
    ('EXTERNAL_CAPACITY_1', '${randomUUID()}', '2026-01-01T12:01:00.000Z')`);
  const visitor = await new Visitor().setup();
  const command = await visitor.command({ action: "publish", role: "generator", quantityKg: "12000", humidityPercent: "28" });
  expect(command.status).toBe(200);
  // Rechazo temprano: la red no recibe preparación ni envío; el estado se conserva honesto y se difiere con cooldown.
  const busy = await eventually(() => visitor.run(), run => run.events[0]?.publication.lastErrorCode === "HCS_CAPACITY_BUSY");
  expect(requiredEntry(busy.events, 0).publication).toMatchObject({ state: "QUEUED", lastErrorCode: "HCS_CAPACITY_BUSY" });
  expect(requiredEntry(busy.events, 0).publication.nextAttemptAt).toBeTruthy();
  expect((await environment.ledger()).messages).toHaveLength(0);
  expect((await environment.ledger()).submissions).toHaveLength(0);
  // Recuperación: al liberar los permisos y superar el cooldown, cron completa el mismo evento sin duplicar.
  await fixture(`DELETE FROM "MaintenanceLease" WHERE name LIKE 'EXTERNAL_CAPACITY_%'`);
  await environment.advance(16000);
  expect((await environment.cron()).status).toBe(200);
  const confirmed = await eventually(() => visitor.run(), run => run.events[0]?.publication.verificationState === "MATCHED");
  const publication = requiredEntry(confirmed.events, 0).publication;
  expect(publication).toMatchObject({ state: "CONFIRMED", automaticAttempts: 1 });
  expect(publication.transactionId).toBeTruthy();
  expect((await environment.ledger()).submissions).toHaveLength(1);
});

test("API-22 · permisos de capacidad vencidos se reclaman y el evento completa sin duplicar", async () => {
  // Permisos vencidos simulan trabajadores caídos: el sucesor debe reclamarlos sin reenviar a ciegas.
  await fixture(`INSERT INTO "MaintenanceLease" (name, owner, "expiresAt") VALUES
    ('EXTERNAL_CAPACITY_0', '${randomUUID()}', '2025-12-31T23:59:00.000Z'),
    ('EXTERNAL_CAPACITY_1', '${randomUUID()}', '2025-12-31T23:59:00.000Z')`);
  const visitor = await new Visitor().setup();
  await visitor.publish();
  const confirmed = await eventually(() => visitor.run(), run => run.events[0]?.publication.verificationState === "MATCHED");
  expect(requiredEntry(confirmed.events, 0).publication).toMatchObject({ state: "CONFIRMED", automaticAttempts: 1 });
  expect((await environment.ledger()).submissions).toHaveLength(1);
});

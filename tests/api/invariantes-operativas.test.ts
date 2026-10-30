import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterAll, beforeEach, expect, inject, test } from "vitest";
import { createScenarioSnapshot } from "../../src/domain/scenario";
import { auditDatabase } from "../../src/server/database/audit";
import { environment, eventually, Visitor } from "../support/client";
import { exceptional, fixture } from "../support/fixtures";

beforeEach(() => environment.reset());
afterAll(() => environment.close());

test("S22-10 · un recibo terminal incompleto no confirma replay ni altera evidencia", async () => {
  const visitor = await new Visitor().setup();
  await visitor.pickup();
  const request = { requestId: randomUUID(), expectedVersion: 5, role: "buyer", action: "receive", receivedKg: "12000" };
  const path = `/api/demo/runs/${visitor.traceId}/commands`;
  const accepted = await visitor.post(path, request);
  expect(accepted.status).toBe(200);
  const before = await eventually(() => visitor.run(), run => run.events.every(event => event.publication.verificationState === "MATCHED"));
  await fixture(`UPDATE "CommandReceipt" SET result=jsonb_set(result,'{operation,receivedKg}','null') WHERE "requestId"=$1`, [request.requestId]);
  const submissions = (await environment.ledger()).submissions;
  const rejected = await visitor.post(path, request);
  expect(rejected.status).toBe(500);
  expect(rejected.body).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
  expect(rejected.body).not.toHaveProperty("saved");
  expect(await visitor.run()).toEqual(before);
  expect((await environment.ledger()).submissions).toEqual(submissions);
  const audit = await auditDatabase(inject("resources").databaseUrl, true);
  expect(audit).toMatchObject({ passed: false, invalid: 1 });
});

test("S22-11 · una fila terminal semánticamente corrupta falla cerrada en HTTP", async () => {
  const visitor = await new Visitor().setup();
  await visitor.pickup();
  await visitor.apply({ role: "buyer", action: "receive", receivedKg: "12000" });
  const before = await visitor.trace();
  await fixture('UPDATE "DemoRun" SET "assignedBuyerId"=$2 WHERE "traceId"=$1::uuid', [visitor.traceId, "otro-comprador"]);
  const submissions = (await environment.ledger()).submissions;
  expect((await visitor.get(`/api/demo/runs/${visitor.traceId}`)).status).toBe(500);
  expect((await visitor.trace()).status).toBe(500);
  expect((await visitor.retry(before.body.events[0]!.eventId)).status).toBe(500);
  expect((await visitor.post(`/api/demo/runs/${visitor.traceId}/commands`, {
    requestId: randomUUID(), expectedVersion: 6, role: "buyer", action: "receive", receivedKg: "12000",
  })).status).toBe(500);
  expect((await environment.ledger()).submissions).toEqual(submissions);
  await fixture('UPDATE "DemoRun" SET "assignedBuyerId"=$2 WHERE "traceId"=$1::uuid', [visitor.traceId, "buyer-demo"]);
  expect((await visitor.trace()).body).toEqual(before.body);
});

test("S22-11 · SQL impide terminales incompletos incluso al omitir triggers de fixtures", async () => {
  const visitor = await new Visitor().setup();
  await visitor.pickup();
  const before = await visitor.run();
  for (const change of [
    `state='RECEIVED', "receivedGrams"=NULL`,
    `state='RECEIVED', "receivedGrams"=11999999`,
    `state='INCIDENT', "receivedGrams"=12000000, "incidentReasonCode"='WEIGHT_MISMATCH'`,
    `state='REJECTED', "assignedBuyerId"=NULL, "assignedTripId"=NULL, "assignedAt"=NULL, "rejectionReasonCode"=NULL`,
  ]) {
    await expect(fixture(`UPDATE "DemoRun" SET ${change} WHERE "traceId"=$1::uuid`, [visitor.traceId], true)).rejects.toMatchObject({ code: "23514", constraint: "DemoRun_state_coherence" });
  }
  expect(await visitor.run()).toEqual(before);
});

test("S22-29 · rollback concurrente no deja recibos, eventos ni pendientes huérfanos", async () => {
  const visitor = await new Visitor().setup();
  const path = `/api/demo/runs/${visitor.traceId}/commands`;
  const request = { requestId: randomUUID(), expectedVersion: 1, role: "generator", action: "publish", quantityKg: "12000", humidityPercent: "28" };
  await exceptional.failEventCommit();
  try {
    const failed = await Promise.all([visitor.post(path, request), visitor.post(path, { ...request, requestId: randomUUID() })]);
    expect(failed.map(result => result.status)).toEqual([500, 500]);
    expect(await visitor.run()).toMatchObject({ version: 1, operation: { state: "DRAFT" }, events: [] });
    expect((await environment.ledger()).submissions).toEqual([]);
    expect(await auditDatabase(inject("resources").databaseUrl, true)).toMatchObject({ passed: true, inspected: 1 });
  } finally { await exceptional.restoreEventCommit(); }
  const result = await visitor.post(path, request);
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({ replayed: false, applied: { version: 2 } });
  const settled = await eventually(() => visitor.run(), run => run.events[0]?.publication.verificationState === "MATCHED");
  expect(settled.events).toHaveLength(1);
  expect((await visitor.post(path, request)).body).toMatchObject({ replayed: true });
  expect((await environment.ledger()).submissions).toHaveLength(1);
  expect(await auditDatabase(inject("resources").databaseUrl, true)).toMatchObject({ passed: true, inspected: 1 });
});

test("S22-11 · validar una migración rechaza historia inválida sin reescribirla", async () => {
  const resources = inject("resources"), admin = new Client({ connectionString: resources.databaseUrl });
  await admin.connect();
  try { await admin.query("CREATE DATABASE s22_upgrade_invalid"); } finally { await admin.end(); }
  const target = new URL(resources.databaseUrl); target.pathname = "/s22_upgrade_invalid";
  const db = new Client({ connectionString: target.href });
  await db.connect();
  try {
    const migrations = (await readdir("prisma/migrations", { withFileTypes: true })).filter(item => item.isDirectory()).map(item => item.name).sort();
    for (const name of migrations.filter(name => name < "202610300001_operation_invariants_expand")) await db.query(await readFile(resolve("prisma/migrations", name, "migration.sql"), "utf8"));
    const sessionId = randomUUID(), runId = randomUUID(), snapshot = createScenarioSnapshot();
    await db.query(`INSERT INTO "DemoSession" (id,"tokenHash","createdAt","expiresAt") VALUES ($1,repeat('a',64),'2026-01-01','2026-01-02')`, [sessionId]);
    await db.query(`INSERT INTO "DemoRun" (id,"traceId","sessionId","creationRequestId",ordinal,state,"createdAt","expiresAt","scenarioVersion","scenarioSnapshot","declaredGrams","humidityHundredths","assignedBuyerId","assignedTripId","assignedAt")
      VALUES ($1,$2,$3,$4,1,'RECEIVED','2026-01-01','2026-01-02',$5,$6,12000000,2800,'buyer-demo','return-a','2026-01-01')`,
    [runId, randomUUID(), sessionId, randomUUID(), snapshot.version, JSON.stringify(snapshot)]);
    const before = (await db.query('SELECT to_jsonb(r) AS evidence FROM "DemoRun" r')).rows;
    expect(await auditDatabase(target.href, true)).toMatchObject({ passed: false, invalid: 1 });
    await db.query(await readFile("prisma/migrations/202610300001_operation_invariants_expand/migration.sql", "utf8"));
    await expect(db.query(await readFile("prisma/migrations/202610300002_operation_invariants_validate/migration.sql", "utf8"))).rejects.toMatchObject({ code: "23514" });
    await db.query("ROLLBACK");
    expect((await db.query('SELECT to_jsonb(r) AS evidence FROM "DemoRun" r')).rows).toEqual(before);
    expect((await db.query(`SELECT convalidated FROM pg_constraint WHERE conname='DemoRun_state_coherence'`)).rows).toEqual([{ convalidated: false }]);
  } finally { await db.end(); }
});

test("S22-11 · expandir historia válida conserva conformidad, rechazo e incidencia completos", async () => {
  const accepted = await new Visitor().setup();
  await accepted.pickup();
  await accepted.apply({ role: "buyer", action: "receive", receivedKg: "12000" });
  const rejected = await new Visitor().setup();
  await rejected.publish("12000", "35.01");
  await rejected.apply({ role: "coordinator", action: "reject", reasonCode: "HUMIDITY_ABOVE_LIMIT" });
  const incident = await new Visitor().setup();
  await incident.pickup();
  await incident.apply({ role: "buyer", action: "incident", receivedKg: "11999", reasonCode: "WEIGHT_MISMATCH" });
  const resources = inject("resources"), source = new Client({ connectionString: resources.databaseUrl });
  const target = new URL(resources.databaseUrl); target.pathname = "/s22_upgrade_valid";
  const db = new Client({ connectionString: target.href });
  await source.connect();
  try {
    await source.query("CREATE DATABASE s22_upgrade_valid");
    await db.connect();
    const migrations = (await readdir("prisma/migrations", { withFileTypes: true })).filter(item => item.isDirectory()).map(item => item.name).sort();
    for (const name of migrations.filter(name => name < "202610300001_operation_invariants_expand")) await db.query(await readFile(resolve("prisma/migrations", name, "migration.sql"), "utf8"));
    const evidence: Array<{ table: string; rows: Array<{ evidence: string }> }> = [];
    for (const table of ["DemoSession", "DemoRun", "SessionRunIntent", "CommandReceipt", "OperationEvent", "HcsPublication", "HcsSubmissionAttempt", "DailyQuota"]) {
      const { rows } = await source.query<{ evidence: string }>(`SELECT to_jsonb(t)::text AS evidence FROM "${table}" t ORDER BY to_jsonb(t)::text`);
      for (const row of rows) await db.query(`INSERT INTO "${table}" SELECT * FROM jsonb_populate_record(NULL::"${table}",$1::jsonb)`, [row.evidence]);
      evidence.push({ table, rows });
    }
    expect(await auditDatabase(target.href, true)).toMatchObject({ passed: true, invalid: 0 });
    for (const name of migrations.filter(name => name >= "202610300001_operation_invariants_expand")) await db.query(await readFile(resolve("prisma/migrations", name, "migration.sql"), "utf8"));
    for (const { table, rows } of evidence) expect((await db.query(`SELECT to_jsonb(t)::text AS evidence FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows).toEqual(rows);
    expect((await db.query(`SELECT convalidated FROM pg_constraint WHERE conname='DemoRun_state_coherence'`)).rows).toEqual([{ convalidated: true }]);
    expect(await auditDatabase(target.href, true)).toMatchObject({ passed: true, invalid: 0 });
  } finally { await db.end(); await source.end(); }
});

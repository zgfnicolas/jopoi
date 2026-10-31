import { requiredEntry } from "../support/required-entry";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeEach, expect, test } from "vitest";
import { environment, Visitor } from "../support/client";
import { exceptional } from "../support/fixtures";

beforeEach(() => environment.reset());
afterAll(() => environment.close());

test("API-13 · un fallo al confirmar SQL revierte acción, evento e intención juntos", async () => {
  const visitor = await new Visitor().setup();
  const input = { requestId: randomUUID(), expectedVersion: 1, role: "generator", action: "publish", quantityKg: "12000", humidityPercent: "28" };
  await exceptional.failEventCommit();
  try {
    const failed = await visitor.post(`/api/demo/runs/${visitor.traceId}/commands`, input);
    expect(failed.status).toBe(500);
    expect(failed.body).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
    expect(JSON.stringify(failed.body)).not.toContain("S17_INJECTED_COMMIT_FAILURE");
    expect(failed.body).not.toHaveProperty("saved");
    expect(await visitor.run()).toMatchObject({ version: 1, operation: { state: "DRAFT" }, events: [] });
    expect((await environment.ledger()).submissions).toEqual([]);
  } finally { await exceptional.restoreEventCommit(); }
  const persisted = await visitor.post(`/api/demo/runs/${visitor.traceId}/commands`, input);
  expect(persisted.status).toBe(200);
  expect(persisted.body).toMatchObject({ saved: true, replayed: false, applied: { version: 2 } });
  expect((await visitor.run()).events).toHaveLength(1);
});

test("API-13 · una caída real de PostgreSQL no confirma cambios inexistentes", async () => {
  const visitor = await new Visitor().setup();
  await environment.database("stop");
  try {
    const failed = await visitor.post(`/api/demo/runs/${visitor.traceId}/commands`, {
      requestId: randomUUID(), expectedVersion: 1, role: "generator", action: "publish", quantityKg: "12000", humidityPercent: "28",
    });
    expect(failed.status).toBe(503);
    expect(failed.body).toMatchObject({ error: { code: "DATABASE_UNAVAILABLE" } });
    expect(failed.body).not.toHaveProperty("saved");
  } finally { await environment.database("start"); }
  expect(await visitor.run()).toMatchObject({ version: 1, operation: { state: "DRAFT" }, events: [] });
});

test("API-14 · vector JCS independiente, orden de claves y alteración de payload", async () => {
  const visitor = await new Visitor().setup();
  const published = await visitor.publish();
  const eventId = published.applied.eventId!;
  // Worked vector: manually ordered JCS keys, fixed demo values; only UUIDs are substituted.
  const canonical = (await readFile("tests/fixtures/published-event.jcs.json", "utf8")).trimEnd()
    .replace("TRACE_ID", visitor.traceId).replace("EVENT_ID", eventId);
  const digest = createHash("sha256").update(canonical, "utf8").digest("hex");
  expect(published.event).toEqual({ payload: JSON.parse(canonical), digest });
  await exceptional.payload(eventId, Object.fromEntries(Object.entries(JSON.parse(canonical)).reverse()));
  const same = await visitor.trace();
  expect(requiredEntry(same.body.events, 0).integrity).toMatchObject({ state: "MATCHED", storedDigest: digest, localDigest: digest });
  expect(requiredEntry(same.body.events, 0).event).toEqual(published.event);
  expect(requiredEntry(same.body.events, 0).publication.state).toBe("CONFIRMED");
  const changedCanonical = canonical.replace('"quantityKg":"12000.000"', '"quantityKg":"12001.000"');
  await exceptional.payload(eventId, JSON.parse(changedCanonical));
  const altered = await visitor.trace();
  expect(requiredEntry(altered.body.events, 0).event).toBeNull();
  expect(requiredEntry(altered.body.events, 0).integrity).toEqual({ state: "MISMATCH", storedDigest: digest,
    localDigest: createHash("sha256").update(changedCanonical, "utf8").digest("hex") });
  expect((await visitor.verification(eventId)).body.state).toBe("MISMATCH");
});

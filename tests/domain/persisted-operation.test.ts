import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createScenarioSnapshot } from "../../src/domain/scenario";
import { reconstructOperationSnapshot } from "../../src/domain/operation-snapshot";
import { createPublicEvent, hashPublicEvent, inspectPublicEvent, readPublicEvent } from "../../src/server/events/payload-core";
import { readReceiptResult, readRunOperation, type StoredRun } from "../../src/server/operations/storage-core";

const scenario = createScenarioSnapshot();
const run: StoredRun = {
  scenarioSnapshot: scenario, scenarioVersion: scenario.version, state: "RECEIVED", declaredGrams: 12000000n,
  humidityHundredths: 2800, assignedBuyerId: "buyer-demo", assignedTripId: "return-a", assignedAt: new Date("2026-01-01Z"),
  receivedGrams: 12000000n, rejectionReasonCode: null, incidentReasonCode: null,
};

test("S22-11 · SQL, recibo y evento conservan un cierre válido sin modificar JSON previo", () => {
  const operation = readRunOperation(run);
  const event = createPublicEvent({ traceId: randomUUID(), eventId: randomUUID(), ordinal: 5, type: "RECEIPT_ACCEPTED",
    role: "buyer", appliedAt: new Date("2026-01-01Z"), operation, snapshot: scenario });
  const receipt = { version: 1, operation, eventId: event.payload.eventId };
  const before = JSON.stringify(receipt);
  assert.deepEqual(readReceiptResult(JSON.parse(before), scenario), receipt);
  assert.equal(JSON.stringify(receipt), before);
});

for (const change of [
  { receivedGrams: null }, { receivedGrams: 11999999n }, { assignedAt: null }, { assignedBuyerId: "otro" },
  { assignedTripId: "desconocido" }, { incidentReasonCode: "WEIGHT_MISMATCH" },
]) {
  test(`S22-11 · rechaza fila SQL inválida: ${Object.keys(change).join(",")}/${String(Object.values(change)[0])}`, () => {
    assert.throws(() => readRunOperation({ ...run, ...change }), { code: "INTERNAL_ERROR" });
  });
}

for (const value of [null, [], {}, "corrupto",
  { version: 1, operation: { ...readRunOperation(run), receivedKg: null }, eventId: randomUUID() },
  { version: 1, operation: { ...readRunOperation(run), quantityKg: "12000" }, eventId: randomUUID() },
]) {
  test(`S22-10 · rechaza recibo corrupto ${JSON.stringify(value)}`, () => {
    assert.throws(() => readReceiptResult(value, scenario), { code: "INTERNAL_ERROR" });
  });
}

test("S22-11 · un hash correcto no habilita un evento con semántica incorrecta", () => {
  const operation = readRunOperation(run);
  const original = createPublicEvent({ traceId: randomUUID(), eventId: randomUUID(), ordinal: 5, type: "RECEIPT_ACCEPTED",
    role: "buyer", appliedAt: new Date("2026-01-01Z"), operation, snapshot: scenario });
  for (const detail of [
    { ...original.payload.detail, receivedKg: "11999.999" },
    { ...original.payload.detail, buyer: { id: "otro", name: scenario.buyer.name } },
    { ...original.payload.detail, trip: { id: "return-a", label: "Etiqueta alterada" } },
    { ...original.payload.detail, scenarioVersion: "otra" },
  ]) {
    const forged = hashPublicEvent({ ...original.payload, detail });
    const row = { id: forged.payload.eventId, ordinal: 5, type: forged.payload.type, simulatedRole: "BUYER" as const,
      appliedAt: new Date(forged.payload.appliedAt), payloadVersion: 1, payload: forged.payload, digest: forged.digest };
    assert.throws(() => readPublicEvent(row, forged.payload.traceId, scenario), { code: "INTERNAL_ERROR" });
    const inspected = inspectPublicEvent(row, forged.payload.traceId, scenario);
    assert.equal(inspected.event, null);
    assert.equal(inspected.integrity.state, "MISMATCH");
    assert.equal(inspected.integrity.localDigest, forged.digest);
  }
});

test("S22-11 · rechazo e incidencia recuperan su contrato histórico válido", () => {
  for (const candidate of [
    { ...readRunOperation(run), state: "REJECTED", humidityPercent: "35.01", receivedKg: null, assignedBuyerId: null,
      assignedTripId: null, rejectionReasonCode: "HUMIDITY_ABOVE_LIMIT" },
    { ...readRunOperation(run), state: "INCIDENT", receivedKg: "11999.999", incidentReasonCode: "WEIGHT_MISMATCH" },
  ]) {
    const result = reconstructOperationSnapshot(candidate, scenario);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("INVALID_FIXTURE");
    const receipt = { version: 1, operation: result.value, eventId: randomUUID() };
    assert.deepEqual(readReceiptResult(receipt, scenario), receipt);
  }
});

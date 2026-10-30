import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJson } from "../../src/domain/canonical-json";
import { operationDataSchema } from "../../src/domain/event-schemas";
import { MAX_OPERATION_GRAMS, formatFixedDecimal } from "../../src/domain/decimal";
import { reconstructOperationSnapshot, toLegacyOperationData } from "../../src/domain/operation-snapshot";
import { decideOperation } from "../../src/domain/operations";
import { createScenarioSnapshot } from "../../src/domain/scenario";
import type { ScenarioSnapshot } from "../../src/domain/scenario-types";
import type { OperationCommand, OperationData } from "../../src/shared/operation-contracts";

const scenario = createScenarioSnapshot();
const draft: OperationData = {
  state: "DRAFT",
  quantityKg: "12000.000",
  humidityPercent: "28.00",
  assignedBuyerId: null,
  assignedTripId: null,
  receivedKg: null,
  rejectionReasonCode: null,
  incidentReasonCode: null,
};
const assigned: OperationData = {
  ...draft,
  state: "ASSIGNED",
  assignedBuyerId: "buyer-demo",
  assignedTripId: "return-a",
};
const received: OperationData = { ...assigned, state: "RECEIVED", receivedKg: "12000.000" };
const rejected: OperationData = {
  ...draft,
  state: "REJECTED",
  rejectionReasonCode: "HUMIDITY_ABOVE_LIMIT",
  humidityPercent: "35.01",
};
const incident: OperationData = {
  ...assigned,
  state: "INCIDENT",
  receivedKg: "11999.999",
  incidentReasonCode: "WEIGHT_MISMATCH",
};

const valid: readonly OperationData[] = [
  draft,
  { ...draft, state: "PUBLISHED" },
  { ...draft, state: "APPROVED" },
  assigned,
  { ...assigned, state: "PICKED_UP" },
  received,
  rejected,
  incident,
];

for (const input of valid) {
  test(`S22-11: reconstruye ${input.state} sin alterar su JSON anterior`, () => {
    const json = canonicalJson(input);
    const result = reconstructOperationSnapshot(JSON.parse(json), JSON.parse(JSON.stringify(scenario)));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(toLegacyOperationData(result.value), input);
    assert.deepEqual(operationDataSchema.parse(toLegacyOperationData(result.value)), input);
    assert.equal(canonicalJson(toLegacyOperationData(result.value)), json);
    assert.equal(Object.isFrozen(result.value), true);
  });
}

const invalid: readonly { readonly name: string; readonly input: unknown }[] = [
  { name: "asignación incompleta", input: { ...assigned, assignedTripId: null } },
  { name: "retiro sin comprador", input: { ...assigned, state: "PICKED_UP", assignedBuyerId: null } },
  { name: "recepción sin peso", input: { ...received, receivedKg: null } },
  { name: "recepción sin viaje", input: { ...received, assignedTripId: null } },
  { name: "recepción con peso diferente", input: { ...received, receivedKg: "11999.999" } },
  { name: "rechazo sin motivo", input: { ...rejected, rejectionReasonCode: null } },
  { name: "rechazo con viaje", input: { ...rejected, assignedTripId: "return-a" } },
  { name: "motivo de rechazo fuera del catálogo", input: { ...rejected, rejectionReasonCode: "UNKNOWN" } },
  { name: "rechazo por humedad que no supera el límite", input: { ...rejected, humidityPercent: "35.00" } },
  { name: "incidencia sin peso", input: { ...incident, receivedKg: null } },
  { name: "incidencia sin motivo", input: { ...incident, incidentReasonCode: null } },
  { name: "incidencia de peso sin diferencia", input: { ...incident, receivedKg: "12000.000" } },
  {
    name: "motivo de incidencia del catálogo de rechazo",
    input: { ...incident, incidentReasonCode: "HUMIDITY_ABOVE_LIMIT" },
  },
  { name: "datos terminales contradictorios", input: { ...incident, rejectionReasonCode: "MATERIAL_NOT_AS_DECLARED" } },
  { name: "estado previo con asignación", input: { ...draft, assignedBuyerId: "buyer-demo" } },
  { name: "estado previo con recepción", input: { ...draft, receivedKg: "12000.000" } },
  { name: "aprobación que supera humedad máxima", input: { ...draft, state: "APPROVED", humidityPercent: "35.01" } },
  { name: "terminal que supera humedad máxima", input: { ...received, humidityPercent: "35.01" } },
  { name: "comprador ajeno al escenario", input: { ...assigned, assignedBuyerId: "other-buyer" } },
  { name: "viaje inexistente", input: { ...assigned, assignedTripId: "unknown" } },
  { name: "viaje sin capacidad suficiente", input: { ...assigned, assignedTripId: "trip-b" } },
  { name: "cantidad no canónica", input: { ...draft, quantityKg: "12000" } },
  { name: "cantidad cero", input: { ...draft, quantityKg: "0.000" } },
  {
    name: "cantidad fuera del rango SQL",
    input: { ...draft, quantityKg: formatFixedDecimal(MAX_OPERATION_GRAMS + 1n, 3) },
  },
  { name: "humedad fuera de rango", input: { ...draft, humidityPercent: "100.01" } },
  { name: "propiedad ausente en JSON", input: { state: "DRAFT", quantityKg: "12000.000", humidityPercent: "28.00" } },
  { name: "propiedad undefined en lugar de null", input: { ...draft, assignedTripId: undefined } },
  { name: "atributo ajeno al contrato", input: { ...draft, secret: "synthetic-private-marker" } },
];

for (const fixture of invalid) {
  test(`S22-11: la frontera pública rechaza ${fixture.name} sin inventar datos`, () => {
    const before = structuredClone(fixture.input);
    const result = reconstructOperationSnapshot(fixture.input, scenario);
    assert.equal(result.ok, false);
    assert.deepEqual(fixture.input, before);
    assert.equal(JSON.stringify(result).includes("synthetic-private-marker"), false);
  });
}

test("S22-11: pesos iguales permiten incidencia de material y rechazo de material con humedad aceptable", () => {
  assert.equal(
    reconstructOperationSnapshot(
      { ...incident, receivedKg: "12000.000", incidentReasonCode: "MATERIAL_ISSUE" },
      scenario,
    ).ok,
    true,
  );
  assert.equal(
    reconstructOperationSnapshot(
      { ...rejected, humidityPercent: "28.00", rejectionReasonCode: "MATERIAL_NOT_AS_DECLARED" },
      scenario,
    ).ok,
    true,
  );
  assert.equal(
    reconstructOperationSnapshot({ ...draft, state: "APPROVED", humidityPercent: "35.00" }, scenario).ok,
    true,
  );
  assert.equal(
    reconstructOperationSnapshot({ ...draft, quantityKg: formatFixedDecimal(MAX_OPERATION_GRAMS, 3) }, scenario).ok,
    true,
  );
});

test("S22-11: rechaza escenarios corruptos o ambiguos y evalúa la compatibilidad del viaje elegido", () => {
  const trip = scenario.trips.find((item) => item.id === "return-a");
  assert(trip);
  assert.equal(reconstructOperationSnapshot(assigned, { ...scenario, trips: [trip, trip] }).ok, false);
  assert.equal(reconstructOperationSnapshot(draft, { ...scenario, buyer: null }).ok, false);
  assert.equal(
    reconstructOperationSnapshot(rejected, {
      ...scenario,
      rejectionReasons: [...scenario.rejectionReasons, ...scenario.rejectionReasons],
    }).ok,
    false,
  );
  assert.equal(
    reconstructOperationSnapshot(incident, {
      ...scenario,
      incidentReasons: [...scenario.incidentReasons, ...scenario.incidentReasons],
    }).ok,
    false,
  );
  for (const incompatible of [
    { ...trip, availableCapacityKg: "11999.999" },
    { ...trip, acceptedMaterialIds: [] },
    { ...trip, bodyType: "ENCLOSED_VAN" },
    { ...trip, routeCompatible: false },
    { ...trip, pickupWindow: { ...trip.pickupWindow, startMinute: 600, endMinute: 700 } },
  ]) {
    assert.equal(reconstructOperationSnapshot(assigned, { ...scenario, trips: [incompatible] }).ok, false);
  }
});

function decide(operation: OperationData, command: OperationCommand, context: ScenarioSnapshot): OperationData {
  const result = decideOperation(operation, command, context);
  assert(result.ok);
  const reconstructed = reconstructOperationSnapshot(result.value.operation, context);
  assert(reconstructed.ok);
  return toLegacyOperationData(reconstructed.value);
}

test("S22-11: el motor vigente conserva conformidad, rechazo, incidencia y guardado al atravesar el adaptador", () => {
  const saved = decide(
    draft,
    { role: "generator", action: "save", quantityKg: "12000", humidityPercent: "28" },
    scenario,
  );
  const published = decide(
    saved,
    { role: "generator", action: "publish", quantityKg: "12000", humidityPercent: "28" },
    scenario,
  );
  assert.equal(
    decide(published, { role: "coordinator", action: "reject", reasonCode: "MATERIAL_NOT_AS_DECLARED" }, scenario)
      .state,
    "REJECTED",
  );
  const approved = decide(published, { role: "coordinator", action: "approve" }, scenario);
  const allocated = decide(approved, { role: "coordinator", action: "assign", tripId: "return-a" }, scenario);
  const pickedUp = decide(allocated, { role: "carrier", action: "pickup" }, scenario);
  assert.equal(decide(pickedUp, { role: "buyer", action: "receive", receivedKg: "12000" }, scenario).state, "RECEIVED");
  assert.equal(
    decide(
      pickedUp,
      { role: "buyer", action: "incident", receivedKg: "11999.999", reasonCode: "WEIGHT_MISMATCH" },
      scenario,
    ).state,
    "INCIDENT",
  );
});

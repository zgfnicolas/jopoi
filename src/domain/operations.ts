import type { ApiErrorCode } from "../shared/api-errors";
import type { OperationAction, OperationCommand, OperationData, OperationDecision, OperationState, SimulatedRole } from "../shared/operation-contracts";
import { evaluateTripCompatibility } from "./compatibility";
import { formatFixedDecimal, parseHumidityHundredths, parseOperationQuantityGrams } from "./decimal";
import { invalidField, type DomainFailure, type DomainResult } from "./result";
import type { ScenarioSnapshot } from "./scenario-types";

type OperationErrorCode = Extract<ApiErrorCode, "INVALID_INPUT" | "RULE_VIOLATION" | "WRONG_ROLE" | "STATE_CONFLICT">;
export type OperationResult<T> = DomainResult<T, OperationErrorCode>;

const ROLES: readonly SimulatedRole[] = ["generator", "coordinator", "carrier", "buyer"];
const TRANSITIONS: Readonly<Record<OperationAction, { readonly role: SimulatedRole; readonly from: OperationState }>> = {
  save: { role: "generator", from: "DRAFT" },
  publish: { role: "generator", from: "DRAFT" },
  approve: { role: "coordinator", from: "PUBLISHED" },
  reject: { role: "coordinator", from: "PUBLISHED" },
  assign: { role: "coordinator", from: "APPROVED" },
  pickup: { role: "carrier", from: "ASSIGNED" },
  receive: { role: "buyer", from: "PICKED_UP" },
  incident: { role: "buyer", from: "PICKED_UP" },
};

function operationFailure(code: "WRONG_ROLE" | "STATE_CONFLICT", field: string, message: string): DomainFailure<OperationErrorCode> {
  return { ok: false, error: { code, fields: { [field]: [message] } } };
}

/** Forma HTTP y atributos extra se rechazan en S08; aquí se validan los datos del comando tipado. */
export function normalizeOperationCommand(command: OperationCommand, snapshot: ScenarioSnapshot): DomainResult<OperationCommand> {
  if (!ROLES.includes(command.role)) return invalidField("role", "Elegí un rol simulado válido.");
  switch (command.action) {
    case "save":
    case "publish": {
      const quantity = parseOperationQuantityGrams(command.quantityKg);
      if (!quantity.ok) return quantity;
      const humidity = parseHumidityHundredths(command.humidityPercent);
      if (!humidity.ok) return humidity;
      return { ok: true, value: { action: command.action, role: command.role,
        quantityKg: formatFixedDecimal(quantity.value, 3), humidityPercent: formatFixedDecimal(humidity.value, 2) } };
    }
    case "reject":
      return snapshot.rejectionReasons.some((reason) => reason.code === command.reasonCode)
        ? { ok: true, value: { action: command.action, role: command.role, reasonCode: command.reasonCode } }
        : invalidField("reasonCode", "Elegí un motivo de rechazo del escenario.");
    case "assign":
      return snapshot.trips.some((trip) => trip.id === command.tripId)
        ? { ok: true, value: { action: command.action, role: command.role, tripId: command.tripId } }
        : invalidField("tripId", "Elegí un viaje del escenario.");
    case "receive":
    case "incident": {
      const received = parseOperationQuantityGrams(command.receivedKg, "receivedKg");
      if (!received.ok) return received;
      if (command.action === "incident") {
        if (!snapshot.incidentReasons.some((reason) => reason.code === command.reasonCode)) {
          return invalidField("reasonCode", "Elegí un motivo de incidencia del escenario.");
        }
        return { ok: true, value: { action: command.action, role: command.role,
          receivedKg: formatFixedDecimal(received.value, 3), reasonCode: command.reasonCode } };
      }
      return { ok: true, value: { action: command.action, role: command.role, receivedKg: formatFixedDecimal(received.value, 3) } };
    }
    case "approve":
    case "pickup":
      return { ok: true, value: { action: command.action, role: command.role } };
    default:
      return invalidField("action", "Elegí una acción operativa válida.");
  }
}

/** Solo se aplica después de comprobar rol y estado no terminal. */
function normalizeCurrent(operation: OperationData, snapshot: ScenarioSnapshot): OperationResult<OperationData> {
  const quantity = parseOperationQuantityGrams(operation.quantityKg);
  if (!quantity.ok) return quantity;
  const humidity = parseHumidityHundredths(operation.humidityPercent);
  if (!humidity.ok) return humidity;
  const expectsAssignment = operation.state === "ASSIGNED" || operation.state === "PICKED_UP";
  const assignmentValid = expectsAssignment
    ? operation.assignedBuyerId === snapshot.buyer.id && snapshot.trips.some((trip) => trip.id === operation.assignedTripId)
    : operation.assignedBuyerId === null && operation.assignedTripId === null;
  if (!assignmentValid || operation.receivedKg !== null || operation.rejectionReasonCode !== null || operation.incidentReasonCode !== null) {
    return operationFailure("STATE_CONFLICT", "state", "La asignación o los datos de cierre no corresponden al estado del recorrido.");
  }
  return { ok: true, value: {
    state: operation.state,
    quantityKg: formatFixedDecimal(quantity.value, 3),
    humidityPercent: formatFixedDecimal(humidity.value, 2),
    assignedBuyerId: operation.assignedBuyerId,
    assignedTripId: operation.assignedTripId,
    receivedKg: null,
    rejectionReasonCode: null,
    incidentReasonCode: null,
  } };
}

function exceedsHumidity(operation: OperationData, snapshot: ScenarioSnapshot): DomainResult<boolean> {
  const humidity = parseHumidityHundredths(operation.humidityPercent);
  if (!humidity.ok) return humidity;
  const maximum = parseHumidityHundredths(snapshot.buyer.maximumHumidityPercent, "maximumHumidityPercent");
  return maximum.ok ? { ok: true, value: humidity.value > maximum.value } : maximum;
}

function weightsDiffer(quantityKg: string, receivedKg: string): DomainResult<boolean> {
  const declared = parseOperationQuantityGrams(quantityKg);
  if (!declared.ok) return declared;
  const received = parseOperationQuantityGrams(receivedKg, "receivedKg");
  return received.ok ? { ok: true, value: declared.value !== received.value } : received;
}

/** Decide sin mutaciones ni IO. S07/S08 persistirán la decisión con su evidencia y autorización. */
export function decideOperation(operation: OperationData, command: OperationCommand, snapshot: ScenarioSnapshot): OperationResult<OperationDecision> {
  const normalized = normalizeOperationCommand(command, snapshot);
  if (!normalized.ok) return normalized;
  const input = normalized.value;
  const transition = TRANSITIONS[input.action];
  if (input.role !== transition.role) {
    return operationFailure("WRONG_ROLE", "role", "El rol representado no permite esta acción.");
  }
  if (operation.state !== transition.from) {
    return operationFailure("STATE_CONFLICT", "state", "La acción no corresponde al estado actual del recorrido.");
  }
  const current = normalizeCurrent(operation, snapshot);
  if (!current.ok) return current;
  const value = current.value;
  let next: OperationData;
  switch (input.action) {
    case "save":
    case "publish":
      next = { ...value, state: input.action === "save" ? "DRAFT" : "PUBLISHED",
        quantityKg: input.quantityKg, humidityPercent: input.humidityPercent };
      break;
    case "approve": {
      const exceeds = exceedsHumidity(value, snapshot);
      if (!exceeds.ok) return exceeds;
      if (exceeds.value) return invalidField("humidityPercent", "La humedad supera el máximo del comprador; revisá el rechazo del lote.", "RULE_VIOLATION");
      next = { ...value, state: "APPROVED" };
      break;
    }
    case "reject": {
      if (input.reasonCode === "HUMIDITY_ABOVE_LIMIT") {
        const exceeds = exceedsHumidity(value, snapshot);
        if (!exceeds.ok) return exceeds;
        if (!exceeds.value) return invalidField("reasonCode", "El motivo de humedad requiere superar el máximo del comprador.", "RULE_VIOLATION");
      }
      next = { ...value, state: "REJECTED", rejectionReasonCode: input.reasonCode };
      break;
    }
    case "assign": {
      const compatibility = evaluateTripCompatibility(value.quantityKg, snapshot);
      if (!compatibility.ok) return compatibility;
      const trip = compatibility.value.find((candidate) => candidate.tripId === input.tripId);
      if (trip === undefined) return invalidField("tripId", "Elegí un viaje del escenario.");
      if (!trip.isCompatible) return { ok: false, error: { code: "RULE_VIOLATION",
        fields: { tripId: trip.checks.filter((check) => !check.isCompatible).map((check) => check.message) } } };
      next = { ...value, state: "ASSIGNED", assignedBuyerId: snapshot.buyer.id, assignedTripId: trip.tripId };
      break;
    }
    case "pickup":
      next = { ...value, state: "PICKED_UP" };
      break;
    case "receive":
    case "incident": {
      const differs = weightsDiffer(value.quantityKg, input.receivedKg);
      if (!differs.ok) return differs;
      if (input.action === "receive") {
        if (differs.value) return invalidField("receivedKg", "El peso difiere del declarado; registrá una incidencia.", "RULE_VIOLATION");
        next = { ...value, state: "RECEIVED", receivedKg: input.receivedKg };
      } else {
        if (input.reasonCode === "WEIGHT_MISMATCH" && !differs.value) {
          return invalidField("reasonCode", "El motivo de peso requiere una diferencia con el declarado.", "RULE_VIOLATION");
        }
        next = { ...value, state: "INCIDENT", receivedKg: input.receivedKg, incidentReasonCode: input.reasonCode };
      }
      break;
    }
  }
  return { ok: true, value: Object.freeze({ operation: Object.freeze(next), createsMilestone: input.action !== "save" }) };
}

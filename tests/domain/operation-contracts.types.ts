import type { OperationSnapshot } from "../../src/shared/operation-snapshot";
import type { OperationIntent } from "../../src/shared/operation-intents";

type RequireTrue<Value extends true> = Value;
type RequireFalse<Value extends false> = Value;
type At<State extends OperationSnapshot["state"]> = Extract<OperationSnapshot, { state: State }>;
type IntentAt<Kind extends OperationIntent["kind"]> = Extract<OperationIntent, { kind: Kind }>;

/** El compilador debe bloquear cambios que vuelvan opcionales datos requeridos; no uses supresiones para probarlo. */
export type OperationContractChecks = [
  RequireTrue<At<"DRAFT">["assignedTripId"] extends null ? true : false>,
  RequireTrue<At<"APPROVED">["receivedKg"] extends null ? true : false>,
  RequireTrue<At<"ASSIGNED"> extends { assignedBuyerId: string; assignedTripId: string } ? true : false>,
  RequireTrue<At<"PICKED_UP"> extends { assignedBuyerId: string; assignedTripId: string } ? true : false>,
  RequireTrue<At<"RECEIVED"> extends { receivedKg: string } ? true : false>,
  RequireTrue<At<"REJECTED"> extends { rejectionReasonCode: string } ? true : false>,
  RequireTrue<At<"REJECTED">["assignedBuyerId"] extends null ? true : false>,
  RequireTrue<At<"INCIDENT"> extends { receivedKg: string; incidentReasonCode: string } ? true : false>,
  RequireTrue<IntentAt<"command"> extends { traceId: string; action: string; expectedVersion: number } ? true : false>,
  RequireTrue<IntentAt<"retry"> extends { traceId: string; eventId: string } ? true : false>,
  RequireTrue<IntentAt<"bootstrap">["path"] extends "/api/demo/session" ? true : false>,
  RequireFalse<"traceId" extends keyof IntentAt<"start"> ? true : false>,
];

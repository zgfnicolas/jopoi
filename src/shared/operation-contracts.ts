import type { OperationSnapshot } from "./operation-snapshot";

/** Contratos JSON del dominio, sin ORM, sesión, versiones SQL ni publicación de red. */
export type OperationState = "DRAFT" | "PUBLISHED" | "APPROVED" | "ASSIGNED" | "PICKED_UP" | "RECEIVED" | "REJECTED" | "INCIDENT";
export type SimulatedRole = "generator" | "coordinator" | "carrier" | "buyer";

export type OperationCommand = { readonly role: SimulatedRole } & (
  | { readonly action: "save" | "publish"; readonly quantityKg: string; readonly humidityPercent: string }
  | { readonly action: "approve" | "pickup" }
  | { readonly action: "reject"; readonly reasonCode: string }
  | { readonly action: "assign"; readonly tripId: string }
  | { readonly action: "receive"; readonly receivedKg: string }
  | { readonly action: "incident"; readonly receivedKg: string; readonly reasonCode: string }
);

export type OperationAction = OperationCommand["action"];

export interface OperationData {
  readonly state: OperationState;
  readonly quantityKg: string;
  readonly humidityPercent: string;
  readonly assignedBuyerId: string | null;
  readonly assignedTripId: string | null;
  readonly receivedKg: string | null;
  readonly rejectionReasonCode: string | null;
  readonly incidentReasonCode: string | null;
}

export interface OperationDecision {
  readonly operation: OperationSnapshot;
  /** Significado de negocio; no afirma persistencia, creación de evento ni consenso. */
  readonly createsMilestone: boolean;
}

export type TripCondition = "MATERIAL" | "CAPACITY" | "BODY_TYPE" | "ROUTE" | "PICKUP_WINDOW";

export interface TripCompatibilityCheck {
  readonly code: TripCondition;
  readonly isCompatible: boolean;
  readonly message: string;
}

export interface TripCompatibility {
  readonly tripId: string;
  readonly isCompatible: boolean;
  readonly checks: readonly TripCompatibilityCheck[];
}

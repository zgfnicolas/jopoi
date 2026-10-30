import type { OperationState } from "./operation-contracts";

type Declared = { readonly quantityKg: string; readonly humidityPercent: string };
type Unassigned = { readonly assignedBuyerId: null; readonly assignedTripId: null };
type Assigned = { readonly assignedBuyerId: string; readonly assignedTripId: string };
type Open = { readonly receivedKg: null; readonly rejectionReasonCode: null; readonly incidentReasonCode: null };
type Stage<State extends OperationState, Details> = Readonly<Declared & { state: State } & Details>;

/** Conservá el JSON existente; el discriminante determina qué datos de cierre o asignación son obligatorios. */
export type OperationSnapshot =
  | Stage<"DRAFT", Unassigned & Open>
  | Stage<"PUBLISHED", Unassigned & Open>
  | Stage<"APPROVED", Unassigned & Open>
  | Stage<"ASSIGNED", Assigned & Open>
  | Stage<"PICKED_UP", Assigned & Open>
  | Stage<
      "RECEIVED",
      Assigned & { readonly receivedKg: string; readonly rejectionReasonCode: null; readonly incidentReasonCode: null }
    >
  | Stage<
      "REJECTED",
      Unassigned & {
        readonly receivedKg: null;
        readonly rejectionReasonCode: string;
        readonly incidentReasonCode: null;
      }
    >
  | Stage<
      "INCIDENT",
      Assigned & {
        readonly receivedKg: string;
        readonly rejectionReasonCode: null;
        readonly incidentReasonCode: string;
      }
    >;

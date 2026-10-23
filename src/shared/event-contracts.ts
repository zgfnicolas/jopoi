import type { OperationData, OperationState, SimulatedRole } from "./operation-contracts";

export type PublicEventType = "LOT_PUBLISHED" | "LOT_APPROVED" | "LOT_REJECTED" | "TRANSPORT_ASSIGNED" | "PICKUP_CONFIRMED" | "RECEIPT_ACCEPTED" | "RECEIPT_ISSUE_REPORTED";

export interface PublicEventPayload {
  readonly version: 1;
  readonly demo: true;
  readonly network: "testnet";
  readonly traceId: string;
  readonly eventId: string;
  readonly ordinal: number;
  readonly type: PublicEventType;
  readonly role: SimulatedRole;
  readonly appliedAt: string;
  readonly detail: {
    readonly state: OperationState;
    readonly scenarioVersion: string;
    readonly material: { readonly id: string; readonly label: string };
    readonly quantityKg: string;
    readonly humidityPercent: string;
    /** Comprador previsto del escenario; el estado distingue si ya fue asignado. */
    readonly buyer: { readonly id: string; readonly name: string };
    readonly trip: { readonly id: string; readonly label: string } | null;
    readonly receivedKg: string | null;
    readonly reason: { readonly code: string; readonly label: string } | null;
  };
}

export interface PublicEventRecord {
  readonly payload: PublicEventPayload;
  readonly digest: string;
}

export interface HcsEventEnvelope {
  readonly version: 1;
  readonly demo: true;
  readonly network: "testnet";
  readonly traceId: string;
  readonly eventId: string;
  readonly ordinal: number;
  readonly type: PublicEventType;
  readonly role: SimulatedRole;
  readonly digest: string;
}

export interface PublicationSummary {
  readonly state: "QUEUED" | "IN_FLIGHT" | "UNCERTAIN" | "CONFIRMED" | "FAILED" | "PAUSED_QUOTA" | "PAUSED_CONFIG";
  readonly verificationState: "NOT_CHECKED" | "PENDING" | "MATCHED" | "MISMATCH" | "UNAVAILABLE";
  readonly network: "testnet";
  readonly topicId: string | null;
  readonly transactionId: string | null;
  readonly sequenceNumber: string | null;
  readonly consensusTimestamp: string | null;
  readonly confirmedAt: string | null;
  readonly verifiedAt: string | null;
  readonly lastErrorCode: string | null;
}

/** Resultado privado: no reutilizar como proyección pública de S11. */
export interface PersistedCommandResult {
  readonly replayed: boolean;
  readonly applied: { readonly operation: OperationData; readonly version: number; readonly eventId: string | null };
  readonly current: { readonly operation: OperationData; readonly version: number };
  readonly event: PublicEventRecord | null;
  readonly publication: PublicationSummary | null;
}

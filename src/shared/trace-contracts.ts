import type { PublicEventRecord, PublicEventType, PublicationSummary } from "./event-contracts";
import type { OperationState, SimulatedRole } from "./operation-contracts";

export interface TraceIntegrity {
  readonly state: "MATCHED" | "MISMATCH";
  readonly storedDigest: string | null;
  readonly localDigest: string | null;
}
export interface TraceEvidence {
  readonly version: 1;
  readonly observedAt: string;
  readonly topicId: string;
  readonly transactionId: string;
  readonly sequenceNumber: string | null;
  readonly consensusTimestamp: string | null;
  readonly localDigest: string;
  readonly remoteDigest: string | null;
  readonly identifiersMatch: boolean;
  readonly digestMatch: boolean;
}
export interface TraceVerification {
  readonly state: PublicationSummary["verificationState"];
  readonly verifiedAt: string | null;
  readonly evidence: TraceEvidence | null;
}
export interface TracePublication {
  readonly state: PublicationSummary["state"];
  readonly network: "testnet";
  readonly topicId: string | null;
  readonly transactionId: string | null;
  readonly sequenceNumber: string | null;
  readonly consensusTimestamp: string | null;
  readonly confirmedAt: string | null;
  readonly lastErrorCode: string | null;
}
export interface TraceLinks {
  readonly transaction: string | null;
  readonly topic: string | null;
  readonly message: string | null;
}
export interface TraceEvent {
  readonly eventId: string;
  readonly ordinal: number;
  readonly type: PublicEventType;
  readonly role: SimulatedRole;
  readonly appliedAt: string;
  readonly payloadVersion: number;
  readonly event: PublicEventRecord | null;
  readonly integrity: TraceIntegrity;
  readonly publication: TracePublication;
  readonly storedVerification: TraceVerification;
  readonly links: TraceLinks;
}
interface FictitiousCompany { readonly id: string; readonly name: string; readonly isFictitious: true }
export interface PublicTraceResponse {
  readonly version: 1;
  readonly demo: true;
  readonly network: "testnet";
  readonly traceId: string;
  readonly expiresAt: string;
  readonly state: OperationState;
  readonly scenario: {
    readonly version: string;
    readonly isIllustrative: true;
    readonly disclaimer: string;
    readonly material: { readonly id: string; readonly label: string; readonly description: string };
    readonly generator: FictitiousCompany;
    readonly buyer: FictitiousCompany;
    readonly route: { readonly id: string; readonly label: string; readonly origin: string; readonly destination: string; readonly distanceKm: string };
    readonly trip: { readonly id: string; readonly label: string; readonly carrier: FictitiousCompany } | null;
  };
  readonly declaration: { readonly eventId: string; readonly quantityKg: string; readonly humidityPercent: string } | null;
  readonly reception: { readonly eventId: string; readonly outcome: "RECEIVED" | "INCIDENT"; readonly receivedKg: string;
    readonly reason: { readonly code: string; readonly label: string } | null } | null;
  readonly events: readonly TraceEvent[];
}
export interface PublicTraceVerificationResponse {
  readonly version: 1;
  readonly demo: true;
  readonly network: "testnet";
  readonly traceId: string;
  readonly eventId: string;
  readonly expiresAt: string;
  readonly payloadVersion: number;
  /** Current verdict; historical evidence never replaces a live observation. */
  readonly state: TraceVerification["state"];
  readonly integrity: TraceIntegrity;
  readonly publication: TracePublication;
  readonly storedVerification: TraceVerification;
  readonly observation: { readonly state: Exclude<TraceVerification["state"], "NOT_CHECKED">;
    readonly code: string | null; readonly evidence: TraceEvidence } | null;
  readonly links: TraceLinks;
}

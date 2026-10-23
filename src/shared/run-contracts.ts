import type { EconomicsSummary } from "../domain/economics";
import type { ScenarioSnapshot } from "../domain/scenario-types";
import type { PersistedCommandResult, PublicEventRecord, PublicationSummary } from "./event-contracts";
import type { OperationCommand, OperationData, TripCompatibility } from "./operation-contracts";
import type { DemoSessionSummary } from "./session-contracts";

/** Cuerpo HTTP plano; credencial y localizador se obtienen de cookie y ruta. */
export type DemoCommandInput = OperationCommand & {
  readonly requestId: string;
  readonly expectedVersion: number;
};

export interface DemoRunDetail {
  readonly traceId: string;
  readonly version: number;
  readonly expiresAt: string;
  readonly operation: OperationData;
  readonly scenario: ScenarioSnapshot;
  readonly compatibility: readonly TripCompatibility[];
  readonly economics: EconomicsSummary;
  readonly events: readonly {
    readonly event: PublicEventRecord;
    readonly publication: PublicationSummary;
  }[];
}

/** Solo propietario; no es la proyección pública compartible de S11. */
export interface DemoRunResponse {
  readonly session: DemoSessionSummary;
  readonly run: DemoRunDetail | null;
}

export interface DemoCommandResponse extends PersistedCommandResult {
  /** Persistencia SQL, sin afirmar envío ni consenso de red. */
  readonly saved: true;
  readonly traceId: string;
}

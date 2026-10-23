/** DTO privados de la demo. No incluyen identidad interna, cookies ni hashes. */
export interface DemoRunIntentInput {
  readonly requestId: string;
}

export interface DemoSessionSummary {
  readonly expiresAt: string;
  readonly runCount: number;
  readonly remainingRuns: number;
}

export interface DemoRunSummary {
  readonly traceId: string;
  readonly state: "DRAFT" | "PUBLISHED" | "APPROVED" | "ASSIGNED" | "PICKED_UP" | "RECEIVED" | "REJECTED" | "INCIDENT";
  readonly version: number;
  readonly expiresAt: string;
}

export interface DemoSessionResponse {
  readonly session: DemoSessionSummary;
  readonly activeRun: DemoRunSummary | null;
}

export interface DemoRunIntentResponse {
  readonly session: DemoSessionSummary;
  readonly run: DemoRunSummary;
  /** Se creó un recorrido en esta petición, no en una petición anterior repetida. */
  readonly created: boolean;
  readonly replayed: boolean;
}

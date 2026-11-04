import { ApplicationError } from "./application-error";

export interface DeadlinePolicy {
  readonly readDeadlineMs: number;
  readonly mutationDeadlineMs: number;
  readonly verificationDeadlineMs: number;
  readonly verificationClosingReserveMs: number;
  readonly mirrorTotalTimeoutMs: number;
  readonly mirrorStepTimeoutMs: number;
  readonly bodyReadTimeoutMs: number;
  readonly sqlMaxWaitMs: number;
  readonly sqlTimeoutMs: number;
}

export const DEFAULT_DEADLINE_POLICY: Readonly<DeadlinePolicy> = Object.freeze({
  readDeadlineMs: 8_000,
  mutationDeadlineMs: 10_000,
  verificationDeadlineMs: 10_000,
  verificationClosingReserveMs: 1_500,
  mirrorTotalTimeoutMs: 6_000,
  mirrorStepTimeoutMs: 3_000,
  bodyReadTimeoutMs: 3_000,
  sqlMaxWaitMs: 2_000,
  sqlTimeoutMs: 5_000,
});

const READ_OPERATIONS = new Set([
  "session.read",
  "runs.current",
  "runs.read",
  "traces.read",
  "traces.verify",
]);

export function isReadOperation(operation: string): boolean {
  return READ_OPERATIONS.has(operation);
}

export function operationBudgetMs(operation: string, policy: DeadlinePolicy = DEFAULT_DEADLINE_POLICY): number {
  if (operation === "traces.verify") return policy.verificationDeadlineMs;
  if (operation === "maintenance.run") return 45_000;
  if (isReadOperation(operation)) return policy.readDeadlineMs;
  return policy.mutationDeadlineMs;
}

export function sqlStepBudget(
  policy: DeadlinePolicy,
  remainingRequestMs?: number,
): { readonly maxWait: number; readonly timeout: number } {
  if (remainingRequestMs === undefined) {
    return { maxWait: policy.sqlMaxWaitMs, timeout: policy.sqlTimeoutMs };
  }
  const remaining = Math.floor(remainingRequestMs);
  if (remaining <= 50) throw new ApplicationError("DATABASE_UNAVAILABLE");
  const maxWait = Math.max(25, Math.min(policy.sqlMaxWaitMs, Math.floor(remaining * 0.3)));
  const timeout = Math.max(25, Math.min(policy.sqlTimeoutMs, remaining - maxWait));
  return { maxWait, timeout };
}

export function mirrorVerificationBudgetMs(policy: DeadlinePolicy, remainingRequestMs?: number): number {
  if (remainingRequestMs === undefined) return policy.mirrorTotalTimeoutMs;
  return Math.max(0, Math.min(policy.mirrorTotalTimeoutMs, Math.floor(remainingRequestMs - policy.verificationClosingReserveMs)));
}

export function raceWithReadAbort<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work();
  if (signal.aborted) return Promise.reject(new ApplicationError("DATABASE_UNAVAILABLE"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new ApplicationError("DATABASE_UNAVAILABLE"));
    signal.addEventListener("abort", onAbort, { once: true });
    work().then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

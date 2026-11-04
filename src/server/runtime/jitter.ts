/** Production jitter sample in [0, 1); the test harness replaces this seam with a deterministic value. */
export const jitterSample = (): number => Math.random();

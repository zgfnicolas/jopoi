/** Bounded dispersion for retry eligibility (D15); never shortens a cooldown. */
export const RETRY_JITTER_POLICY = Object.freeze({
  /** Maximum added delay as a fraction of the cooldown. */
  ratio: 0.2,
  /** Absolute cap of the added delay. */
  maxJitterMs: 120_000,
});

/**
 * Eligibility instant = now + cooldown + bounded jitter.
 * `sample` comes from an injectable policy seam (`@/server/runtime/jitter`), clamped to [0, 1).
 * Jitter never pushes a retry past the run expiry when the cooldown alone would still fit.
 */
export function eligibleAt(now: Date, cooldownMs: number, expiresAt: Date | null, sample: number, policy = RETRY_JITTER_POLICY): Date {
  const base = now.getTime() + Math.max(0, cooldownMs);
  const bounded = Number.isFinite(sample) ? Math.min(Math.max(sample, 0), 0.999999) : 0;
  const span = Math.min(Math.floor(Math.max(0, cooldownMs) * policy.ratio), policy.maxJitterMs);
  let at = base + Math.floor(bounded * span);
  if (expiresAt !== null && base < expiresAt.getTime() && at >= expiresAt.getTime()) at = Math.max(base, expiresAt.getTime() - 1);
  return new Date(at);
}

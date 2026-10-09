/**
 * A fixed-window rate limiter for the local API (P21 security review).
 *
 * Scope: brute-force damping on the two routes that answer questions worth
 * automating — auth sign-in/sign-up (Better Auth only limits itself in
 * production, so dev and LAN sessions had no limiter at all) and the AI
 * routes (the daily cap prices the work but does not slow a hammer).
 *
 * Deliberately in-memory and per-process: this app runs as one Node process on
 * one machine (ADR-017), so a shared store would be coordination with nobody.
 * Windows are fixed rather than sliding because the goal is "slow a script
 * down", not exact accounting — one integer per key, pruned as it ages.
 */

export interface LimiterDecision {
  allowed: boolean;
  /** Requests still available in the current window. */
  remaining: number;
  /** Seconds until the window resets (0 when allowed). */
  retryAfterSec: number;
}

export interface Limiter {
  check(key: string): LimiterDecision;
  /** Drop all state — tests and nothing else. */
  reset(): void;
}

export interface LimiterOptions {
  /** Length of one window, in milliseconds. */
  windowMs: number;
  /** Requests permitted per key per window. */
  max: number;
  /** Clock, injectable so tests never sleep. */
  now?: () => number;
  /** Safety valve: sweep the map when it grows past this many keys. */
  maxKeys?: number;
}

interface Bucket {
  count: number;
  windowStart: number;
}

export function createLimiter(options: LimiterOptions): Limiter {
  const { windowMs, max } = options;
  const now = options.now ?? Date.now;
  const maxKeys = options.maxKeys ?? 2000;
  const buckets = new Map<string, Bucket>();

  /** Age out finished windows; drop everything if a flood filled the map. */
  function prune(t: number): void {
    if (buckets.size <= maxKeys) {
      for (const [key, bucket] of buckets) {
        if (t - bucket.windowStart >= windowMs) buckets.delete(key);
      }
      return;
    }
    // Above the cap the keys are almost certainly a scan across many IPs:
    // forget the whole map rather than let it grow without bound. Everyone
    // gets a fresh window, which costs a limiter nothing and the attacker
    // their accumulated progress.
    buckets.clear();
  }

  return {
    check(key: string): LimiterDecision {
      const t = now();
      prune(t);

      const bucket = buckets.get(key);
      if (!bucket || t - bucket.windowStart >= windowMs) {
        buckets.set(key, { count: 1, windowStart: t });
        return { allowed: true, remaining: max - 1, retryAfterSec: 0 };
      }

      if (bucket.count >= max) {
        const retryAfterSec = Math.max(1, Math.ceil((bucket.windowStart + windowMs - t) / 1000));
        return { allowed: false, remaining: 0, retryAfterSec };
      }

      bucket.count += 1;
      return { allowed: true, remaining: max - bucket.count, retryAfterSec: 0 };
    },
    reset(): void {
      buckets.clear();
    },
  };
}

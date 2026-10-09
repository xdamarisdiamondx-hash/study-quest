import { describe, expect, it } from "vitest";

import { createLimiter } from "./ratelimit.ts";

/** A limiter on a clock the test moves by hand. */
function fakeClock(windowMs: number, max: number) {
  let t = 1_000_000;
  const limiter = createLimiter({ windowMs, max, now: () => t });
  return {
    limiter,
    pass(ms: number) {
      t += ms;
    },
  };
}

describe("createLimiter", () => {
  it("allows up to max, then refuses with a retry-after inside the window", () => {
    const { limiter } = fakeClock(60_000, 3);

    expect(limiter.check("a")).toMatchObject({ allowed: true, remaining: 2 });
    expect(limiter.check("a")).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check("a")).toMatchObject({ allowed: true, remaining: 0 });

    const refused = limiter.check("a");
    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(0);
    expect(refused.retryAfterSec).toBeGreaterThan(0);
    expect(refused.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("keeps each key's window separate", () => {
    const { limiter } = fakeClock(60_000, 1);

    expect(limiter.check("ip-a").allowed).toBe(true);
    expect(limiter.check("ip-a").allowed).toBe(false);
    // A different key is untouched by the first key's exhaustion.
    expect(limiter.check("ip-b").allowed).toBe(true);
  });

  it("opens a fresh window once the old one has aged out", () => {
    const { limiter, pass } = fakeClock(60_000, 1);

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);

    pass(59_999);
    expect(limiter.check("a").allowed).toBe(false);

    pass(1);
    expect(limiter.check("a")).toMatchObject({ allowed: true, remaining: 0 });
  });

  it("reports a retry-after that shrinks as the window runs out", () => {
    const { limiter, pass } = fakeClock(10_000, 1);

    limiter.check("a");
    const early = limiter.check("a").retryAfterSec;
    pass(9_000);
    const late = limiter.check("a").retryAfterSec;

    expect(early).toBe(10);
    expect(late).toBe(1);
    // Never promises 0 seconds while still refusing.
    expect(Math.min(early, late)).toBeGreaterThanOrEqual(1);
  });

  it("forgets aged buckets as it prunes, so a slow key starts clean", () => {
    const { limiter, pass } = fakeClock(1_000, 2);

    limiter.check("quiet");
    pass(2_000);
    expect(limiter.check("quiet")).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("clears the whole map rather than grow past the key cap (IP-scan valve)", () => {
    const { limiter } = createLimiterWithSmallCap();

    for (let i = 0; i < 60; i++) limiter.check(`scan-${i}`);
    // Past the cap the map is wiped: an old key gets a fresh allowance again.
    expect(limiter.check("scan-0").allowed).toBe(true);
  });
});

function createLimiterWithSmallCap() {
  return { limiter: createLimiter({ windowMs: 60_000, max: 1, maxKeys: 50 }) };
}

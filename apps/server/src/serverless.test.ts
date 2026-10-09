/**
 * The serverless switch and the cron guard — two decisions that must not
 * drift: which host this process is on (it decides where state may live), and
 * whether a caller holding the cron URL is the platform or a stranger.
 */
import { afterEach, describe, expect, it } from "vitest";

import { cronAuthorized, isServerless } from "./serverless.ts";

const ORIGINAL = { VERCEL: process.env.VERCEL, NETLIFY: process.env.NETLIFY };

function setEnv(next: { VERCEL?: string; NETLIFY?: string }): void {
  for (const key of ["VERCEL", "NETLIFY"] as const) {
    if (next[key] === undefined) delete process.env[key];
    else process.env[key] = next[key];
  }
}

afterEach(() => setEnv(ORIGINAL));

describe("isServerless", () => {
  it("is false for a plain local process", () => {
    setEnv({});
    expect(isServerless()).toBe(false);
  });

  it("is true under Vercel", () => {
    setEnv({ VERCEL: "1" });
    expect(isServerless()).toBe(true);
  });

  it("is true under Netlify", () => {
    setEnv({ NETLIFY: "true" });
    expect(isServerless()).toBe(true);
  });
});

describe("cronAuthorized", () => {
  const SECRET = "s3cret-token";

  it("admits exactly the platform's bearer token", () => {
    expect(cronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("refuses a missing or wrong token", () => {
    expect(cronAuthorized(undefined, SECRET)).toBe(false);
    expect(cronAuthorized("Bearer wrong", SECRET)).toBe(false);
    expect(cronAuthorized(SECRET, SECRET)).toBe(false); // scheme missing
  });

  it("fails closed when no secret is configured", () => {
    // An unset CRON_SECRET must admit nobody — "Bearer undefined" is not a token.
    expect(cronAuthorized("Bearer undefined", undefined)).toBe(false);
    expect(cronAuthorized(undefined, undefined)).toBe(false);
  });
});

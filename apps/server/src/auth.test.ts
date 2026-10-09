/**
 * The auth CSRF boundary: which origins may POST to `/api/auth/*`.
 *
 * Better Auth answers 403 `INVALID_ORIGIN` to every origin outside this list, so a
 * mistake here does not fail loudly — it shows up as "that email and password do not
 * match an account" on the sign-in form. The bug that motivated this file: `.env.example`
 * binds `HOST` to `127.0.0.1` while every URL the app prints says `localhost`, two names
 * for the same socket that Better Auth compares as different origins.
 */
import { networkInterfaces } from "node:os";

import { describe, expect, it } from "vitest";

import { trustedOrigins } from "./auth.ts";

describe("trustedOrigins", () => {
  const origins = trustedOrigins("http://127.0.0.1:4321");

  it("trusts the configured base origin and the vite dev server", () => {
    expect(origins).toContain("http://127.0.0.1:4321");
    expect(origins).toContain("http://localhost:5173");
    expect(origins).toContain("http://127.0.0.1:5173");
  });

  it("trusts both loopback spellings of the serving port", () => {
    // The fresh-install bug: HOST=127.0.0.1, printed URL says localhost.
    expect(origins).toContain("http://localhost:4321");
    expect(origins).toContain("https://localhost:4321");
    expect(origins).toContain("https://127.0.0.1:4321");
    // And the local preview server the P20 phone flow runs on.
    expect(origins).toContain("https://localhost:4173");
    expect(origins).toContain("http://localhost:4173");
  });

  it("trusts only the serving port, not every port on loopback", () => {
    const other = trustedOrigins("http://127.0.0.1:9999");
    expect(other).toContain("http://localhost:9999");
    expect(other).not.toContain("http://localhost:4321");
  });

  it("trusts this machine's LAN addresses so a phone preview can sign in", () => {
    const lan = Object.values(networkInterfaces())
      .flat()
      .find((address) => address && !address.internal && String(address.family).match(/^4$/));
    if (!lan) return; // No network on this machine: nothing to assert.
    expect(origins).toContain(`http://${lan.address}:4173`);
    expect(origins).toContain(`https://${lan.address}:4173`);
  });

  it("never trusts an unrelated site", () => {
    expect(origins).not.toContain("https://evil.example");
    expect(origins.every((origin) => !origin.includes("evil"))).toBe(true);
  });

  it("survives a malformed base URL instead of trusting nothing", () => {
    const broken = trustedOrigins("not a url");
    expect(broken).toContain("http://localhost:5173");
    expect(broken).toContain("http://localhost:4173");
  });

  it("adds the deployment origins a hosted instance passes in", () => {
    // Vercel tells the function which hosts it serves under; those join the
    // list verbatim (a stray trailing slash is not a second origin).
    const hosted = trustedOrigins("https://study-quest.vercel.app", [
      "https://study-quest.vercel.app",
      "https://study-quest-git-main-someone.vercel.app/",
    ]);
    expect(hosted).toContain("https://study-quest.vercel.app");
    expect(hosted).toContain("https://study-quest-git-main-someone.vercel.app");
    // The local spellings are still there — one build serves both hosts.
    expect(hosted).toContain("http://localhost:4173");
  });

  it("ignores empty extra origins instead of trusting the current origin", () => {
    const hosted = trustedOrigins("https://study-quest.vercel.app", ["", undefined as never]);
    expect(hosted).not.toContain("");
  });
});

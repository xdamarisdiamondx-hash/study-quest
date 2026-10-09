/**
 * The serverless guard on the database fallback.
 *
 * On Vercel an empty PGlite would start on every cold throw and every note
 * written there would vanish with the instance — so the same silent fallback
 * that keeps a laptop install working must end in a loud refusal on a host
 * with no disk. The refusal has to fire both when DATABASE_URL is missing and
 * when it is present but unreachable, which is where the try/catch below
 * used to fall through.
 */
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createDb } from "./client.ts";

const ORIGINAL = {
  VERCEL: process.env.VERCEL,
  NETLIFY: process.env.NETLIFY,
  DATABASE_URL: process.env.DATABASE_URL,
};

function setEnv(next: { VERCEL?: string; DATABASE_URL?: string | undefined }): void {
  if (next.VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = next.VERCEL;
  if (next.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = next.DATABASE_URL;
}

afterEach(() => setEnv({ VERCEL: ORIGINAL.VERCEL, DATABASE_URL: ORIGINAL.DATABASE_URL }));

describe("createDb on a serverless host", () => {
  it("refuses to start without DATABASE_URL instead of falling back to PGlite", async () => {
    setEnv({ VERCEL: "1", DATABASE_URL: undefined });
    await expect(createDb(undefined)).rejects.toThrow(/DATABASE_URL is not set/);
  });

  it("refuses to fall back when the configured PostgreSQL is unreachable", async () => {
    setEnv({ VERCEL: "1" });
    // A connection string that cannot answer: the probe retries, then the old
    // code fell into PGlite. It must end in the same loud refusal.
    await expect(
      createDb("postgres://user:pass@127.0.0.1:9/none?connect_timeout=1&sslmode=disable"),
    ).rejects.toThrow(/unreachable on this serverless deployment/);
  }, 30_000);

  it("still falls back to PGlite for a local process (ADR-028)", async () => {
    setEnv({ VERCEL: undefined, DATABASE_URL: undefined });
    // Its own temp directory: PGlite is single-process, and the repository's
    // data/pgdata belongs to the running app, not to tests.
    const dir = join(tmpdir(), `sq-client-test-${process.pid}`);
    process.env.PGLITE_DIR = dir;
    try {
      const db = await createDb(undefined);
      expect(db.driver).toBe("pglite");
      await db.close();
    } finally {
      delete process.env.PGLITE_DIR;
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

/**
 * Seed data: levels and achievements.
 *
 * Both are global reference tables with no user ownership, so they are safe to seed
 * into a shared database. The statements themselves live in services/reference.ts —
 * the server runs the same function at boot, so this CLI is the explicit way to
 * (re)write them, not the only way. Subjects are per-user and are created during
 * onboarding from the templates in @sq/core/starter.
 *
 * Safe to re-run: every insert is an upsert.
 */
// `.env` first: createDb() defaults to process.env.DATABASE_URL, and imports hoist
// above anything in this file's body. See env.ts.
import "./env.ts";

import { createDb } from "@sq/db/client";

import { ensureReferenceData } from "./services/reference.ts";

export async function seed() {
  const db = await createDb();
  console.log(`[seed] driver: ${db.driver}`);

  const written = await ensureReferenceData(db.orm);
  console.log(`[seed] ${written.levels} levels`);
  console.log(`[seed] ${written.achievements} achievements`);

  await db.close();
  console.log("[seed] done");
}

if (process.argv[1]?.endsWith("seed.ts")) {
  await seed();
}

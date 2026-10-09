/**
 * Reference data (P22): the server writes the XP curve and the achievement catalogue
 * itself instead of trusting that `pnpm db:seed` was run.
 *
 * The bug it exists for: `user_achievements.achievement_code` references `achievements`,
 * so a database that was migrated but never seeded answers every gamification read with
 * a 23503 foreign-key violation — which is what the live Neon branch did. The test
 * empties both tables (the state a clean install starts in) and requires them back,
 * complete and correct, twice: the second run is the boot-time call on a database that
 * already has rows.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Db } from "@sq/db/client";
import { createDb } from "@sq/db/client";
import { ACHIEVEMENTS, xpRequired } from "@sq/core/gamification";
import { achievements, levels, userAchievements, users } from "@sq/db/schema";
import { eq } from "drizzle-orm";

import { ensureReferenceData } from "./reference.ts";

let db: Db;
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "sq-reference-"));
  process.env.PGLITE_DIR = dir;
  // "" is falsy: force the PGlite path even if a DATABASE_URL leaks in.
  db = await createDb("");
});

afterAll(async () => {
  await db.close();
  rmSync(dir, { recursive: true, force: true });
});

async function readAll() {
  return {
    achievements: await db.orm.select().from(achievements),
    levels: await db.orm.select().from(levels).orderBy(levels.level),
  };
}

describe("ensureReferenceData", () => {
  it("fills an empty database — the state that 23503ed gamification on Neon", async () => {
    await db.orm.delete(achievements);
    await db.orm.delete(levels);

    const empty = await readAll();
    expect(empty.achievements).toHaveLength(0);
    expect(empty.levels).toHaveLength(0);

    const written = await ensureReferenceData(db.orm);

    const filled = await readAll();
    expect(written).toEqual({ levels: 50, achievements: ACHIEVEMENTS.length });
    expect(filled.achievements).toHaveLength(ACHIEVEMENTS.length);
    expect(filled.levels).toHaveLength(50);
    expect(filled.achievements.map((a) => a.code).sort()).toEqual(
      ACHIEVEMENTS.map((a) => a.code).sort(),
    );
    // The curve is derived, not copied: level 10 must be the formula's answer.
    expect(filled.levels[9]?.xpRequired).toBe(xpRequired(10));
  });

  it("repairs a drifted row on the second run — upsert, not insert", async () => {
    await db.orm.update(levels).set({ xpRequired: 999_999 }).where(eq(levels.level, 7));
    await ensureReferenceData(db.orm);

    const rows = await readAll();
    expect(rows.levels).toHaveLength(50);
    expect(rows.levels[6]?.xpRequired).toBe(xpRequired(7));
    expect(rows.achievements).toHaveLength(ACHIEVEMENTS.length);
  });

  it("lets user_achievements reference a catalogue row — the 23503 itself", async () => {
    const [profile] = await db.orm
      .insert(users)
      .values({ authUserId: "auth-reference", displayName: "Reference" })
      .returning({ id: users.id });

    await db.orm.insert(userAchievements).values({
      userId: profile!.id,
      achievementCode: ACHIEVEMENTS[0]!.code,
      progress: 1,
      unlockedAt: null,
    });

    const rows = await db.orm.select().from(userAchievements);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.achievementCode).toBe(ACHIEVEMENTS[0]!.code);
  });
});

/**
 * Seed data: levels and achievements.
 *
 * Both are global reference tables with no user ownership, so they are safe to seed
 * into a shared database. Subjects are per-user and are created during onboarding
 * from the templates in @sq/core/starter.
 *
 * The achievement catalogue itself lives in @sq/core/gamification (P15) — the
 * screens and the evaluator read it there; this writes it into `achievements`
 * as reference data. Safe to re-run: every insert is an upsert.
 */
import { sql } from "drizzle-orm";

import { createDb } from "@sq/db/client";
import { ACHIEVEMENTS, xpRequired, LEVEL_TITLES } from "@sq/core/gamification";
import * as dbSchema from "@sq/db/schema";

const { levels, achievements } = dbSchema;

export async function seed() {
  const db = await createDb();
  console.log(`[seed] driver: ${db.driver}`);

  // Levels 1..50, straight from the XP curve so the two can never disagree.
  const levelRows = Array.from({ length: 50 }, (_, i) => {
    const level = i + 1;
    return {
      level,
      xpRequired: xpRequired(level),
      title: LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1] ?? `Level ${level}`,
    };
  });
  await db.orm
    .insert(levels)
    .values(levelRows)
    .onConflictDoUpdate({
      target: levels.level,
      set: {
        xpRequired: sql`excluded.xp_required`,
        title: sql`excluded.title`,
      },
    });
  console.log(`[seed] ${levelRows.length} levels`);

  await db.orm
    .insert(achievements)
    .values(ACHIEVEMENTS.map((a) => ({ ...a, hidden: false })))
    .onConflictDoUpdate({
      target: achievements.code,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        xpReward: sql`excluded.xp_reward`,
        criteria: sql`excluded.criteria`,
        hidden: sql`excluded.hidden`,
      },
    });
  console.log(`[seed] ${ACHIEVEMENTS.length} achievements`);

  await db.close();
  console.log("[seed] done");
}

if (process.argv[1]?.endsWith("seed.ts")) {
  await seed();
}

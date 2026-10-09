/**
 * Global reference data: the XP curve (levels 1..50) and the achievement catalogue.
 *
 * Both are catalogue rows with no owner, so they are safe to write into any database.
 * They matter more than they look: `user_achievements.achievement_code` is a foreign
 * key into `achievements`, so a database that was migrated but never seeded answers
 * every gamification read with a 23503 — which is exactly what happened against the
 * live Neon branch until the server started writing this itself at boot (P22).
 *
 * Every statement is an upsert, so this is safe to repeat, safe on a shared database,
 * and identical to what `pnpm db:seed` runs from the command line.
 */
import { sql } from "drizzle-orm";

import type { Orm } from "@sq/db/client";
import { ACHIEVEMENTS, LEVEL_TITLES, xpRequired } from "@sq/core/gamification";
import * as dbSchema from "@sq/db/schema";

const { levels, achievements } = dbSchema;

export interface ReferenceCounts {
  levels: number;
  achievements: number;
}

/** Write the level curve and achievement catalogue. Idempotent. */
export async function ensureReferenceData(orm: Orm): Promise<ReferenceCounts> {
  // Levels 1..50, straight from the XP curve so the two can never disagree.
  const levelRows = Array.from({ length: 50 }, (_, i) => {
    const level = i + 1;
    return {
      level,
      xpRequired: xpRequired(level),
      title: LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1] ?? `Level ${level}`,
    };
  });
  await orm
    .insert(levels)
    .values(levelRows)
    .onConflictDoUpdate({
      target: levels.level,
      set: {
        xpRequired: sql`excluded.xp_required`,
        title: sql`excluded.title`,
      },
    });

  // The catalogue @sq/core/gamification already evaluates — written here so the
  // foreign key on user_achievements has rows to point at.
  await orm
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

  return { levels: levelRows.length, achievements: ACHIEVEMENTS.length };
}

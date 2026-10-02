/**
 * Seed data: levels and achievements.
 *
 * Both are global reference tables with no user ownership, so they are safe to seed
 * into a shared database. Subjects are per-user and are created during onboarding
 * from the templates in @sq/core/starter.
 *
 * Safe to re-run: every insert is an upsert.
 */
import { sql } from "drizzle-orm";

import { createDb } from "@sq/db/client";
import { xpRequired, LEVEL_TITLES } from "@sq/core/gamification";
import * as dbSchema from "@sq/db/schema";

const { levels, achievements } = dbSchema;

const ACHIEVEMENTS = [
  {
    code: "first_quest",
    name: "First Quest",
    description: "Complete your first Study Quest.",
    xpReward: 50,
    criteria: { questsCompleted: 1 },
  },
  {
    code: "quiz_master",
    name: "Quiz Master",
    description: "Complete 10 quizzes.",
    xpReward: 100,
    criteria: { quizzesCompleted: 10 },
  },
  {
    code: "consistent_learner",
    name: "Consistent Learner",
    description: "Study for 7 days in a row.",
    xpReward: 150,
    criteria: { streakDays: 7 },
  },
  {
    code: "subject_explorer",
    name: "Subject Explorer",
    description: "Study 5 different subjects.",
    xpReward: 100,
    criteria: { subjectsStudied: 5 },
  },
  {
    code: "comeback",
    name: "Comeback",
    description: "Improve your score after reviewing your mistakes.",
    xpReward: 75,
    criteria: { improvedAfterRetry: true },
  },
  {
    code: "note_taker",
    name: "Note Taker",
    description: "Write your first 10 notes.",
    xpReward: 50,
    criteria: { notesCreated: 10 },
  },
  {
    code: "card_sharp",
    name: "Card Shark",
    description: "Review 50 flashcards.",
    xpReward: 75,
    criteria: { flashcardsReviewed: 50 },
  },
  {
    code: "early_bird",
    name: "Early Bird",
    description: "Complete a study session before 8am.",
    xpReward: 50,
    criteria: { sessionBeforeHour: 8 },
  },
];

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

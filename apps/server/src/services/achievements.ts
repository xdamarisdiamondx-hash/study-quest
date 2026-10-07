/**
 * Achievements (P15, PRD §23): facts, progress, unlock, claim.
 *
 * The catalogue lives in `@sq/core/gamification` — global reference data like
 * the quest templates, so the screens and the evaluator read the same ten rows
 * without a table round-trip (the seed still writes them into `achievements`
 * as reference data). What this module owns is the per-user half:
 *
 * - **Facts** are counted from rows the server already owns — finished
 *   sessions, graded attempts, rated cards, completed quests. Nothing is
 *   derived from a screen, so opening the app can never move a bar (§23's
 *   anti-pattern line).
 * - **Progress is persisted on every read** (`user_achievements`, one row per
 *   achievement) as a *high-water mark*: a streak that later resets never
 *   rewinds a bar the student already earned.
 * - **The reward is claimed, not sprayed**: unlocking only sets `unlockedAt`;
 *   the XP lands when the student presses Claim, keyed in the ledger by the
 *   achievement's code, so a double-press answers with the same row and never
 *   a second one (ADR-015).
 */
import { and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  ACHIEVEMENTS,
  achievementProgress,
  type Achievement,
  type AchievementFacts,
} from "@sq/core/gamification";
import * as dbSchema from "@sq/db/schema";

import { db } from "../db.ts";
import { awardXp, loadStreak } from "./xp.ts";

const {
  flashcards,
  flashcardDecks,
  flashcardReviews,
  notes,
  quizAttempts,
  quizzes,
  quests,
  studySessions,
  topics,
  userAchievements,
  xpLedger,
} = dbSchema;

/** A deck's own topic, when its cards were saved without one of their own. */
const deckTopics = alias(topics, "deck_topics");

/** One achievement as the screens show it: catalogue + the user's own row. */
export interface AchievementStatus {
  code: string;
  name: string;
  description: string;
  xpReward: number;
  /** High-water progress toward `target`; equal to `target` once unlocked. */
  progress: number;
  target: number;
  unlockedAt: string | null;
  claimed: boolean;
}

/* --- facts --------------------------------------------------------------- */

/**
 * Everything the catalogue counts, in one pass over rows the server owns.
 * "Studied a subject" is the union of three acts — a finished session, a
 * graded quiz attempt and rated flashcards — each resolved to its subject,
 * because any of them is real work in that subject.
 */
export async function gatherFacts(profileId: string): Promise<AchievementFacts> {
  const count = (rows: ({ n: number | null } | undefined)[]) => rows[0]?.n ?? 0;

  const [questsDone] = await db.orm
    .select({ n: sql<number>`count(*)::int` })
    .from(quests)
    .where(and(eq(quests.userId, profileId), eq(quests.status, "completed")));

  const quizRows = await db.orm
    .selectDistinct({ quizId: quizAttempts.quizId })
    .from(quizAttempts)
    .where(eq(quizAttempts.userId, profileId));

  const streak = await loadStreak(profileId);

  const sessionSubjects = await db.orm
    .select({ id: sql<string | null>`coalesce(${studySessions.subjectId}, ${topics.subjectId})` })
    .from(studySessions)
    .leftJoin(topics, eq(studySessions.topicId, topics.id))
    .where(and(eq(studySessions.userId, profileId), eq(studySessions.status, "completed")));

  const attemptSubjects = await db.orm
    .select({ id: sql<string | null>`${topics.subjectId}` })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
    .leftJoin(topics, eq(quizzes.topicId, topics.id))
    .where(eq(quizAttempts.userId, profileId));

  const cardSubjects = await db.orm
    .select({ id: sql<string | null>`coalesce(${topics.subjectId}, ${deckTopics.subjectId})` })
    .from(flashcardReviews)
    .innerJoin(flashcards, eq(flashcardReviews.flashcardId, flashcards.id))
    .innerJoin(flashcardDecks, eq(flashcards.deckId, flashcardDecks.id))
    .leftJoin(topics, eq(flashcards.topicId, topics.id))
    .leftJoin(deckTopics, eq(flashcardDecks.topicId, deckTopics.id))
    .where(eq(flashcardDecks.userId, profileId));

  const [notesRow] = await db.orm
    .select({ n: sql<number>`count(*)::int` })
    .from(notes)
    .where(eq(notes.userId, profileId));

  const [reviewsRow] = await db.orm
    .select({ n: sql<number>`count(*)::int` })
    .from(flashcardReviews)
    .innerJoin(flashcards, eq(flashcardReviews.flashcardId, flashcards.id))
    .innerJoin(flashcardDecks, eq(flashcards.deckId, flashcardDecks.id))
    .where(eq(flashcardDecks.userId, profileId));

  const [sessionsRow] = await db.orm
    .select({ n: sql<number>`count(*)::int` })
    .from(studySessions)
    .where(and(eq(studySessions.userId, profileId), eq(studySessions.status, "completed")));

  // Comeback reads the ledger rather than re-deriving attempt history: the
  // award and the achievement can never disagree about whether it happened.
  const [retryRow] = await db.orm
    .select({ n: sql<number>`count(*)::int` })
    .from(xpLedger)
    .where(and(eq(xpLedger.userId, profileId), eq(xpLedger.reason, "retry_improved")));

  const [earliest] = await db.orm
    .select({ startedAt: studySessions.startedAt })
    .from(studySessions)
    .where(and(eq(studySessions.userId, profileId), eq(studySessions.status, "completed")))
    .orderBy(studySessions.startedAt)
    .limit(1);

  const subjects = new Set<string>();
  for (const row of [...sessionSubjects, ...attemptSubjects, ...cardSubjects])
    if (row.id) subjects.add(row.id);

  return {
    questsCompleted: count([questsDone]),
    quizzesCompleted: quizRows.length,
    streakDays: streak.current,
    subjectsStudied: subjects.size,
    improvedAfterRetry: count([retryRow]) > 0,
    notesCreated: count([notesRow]),
    flashcardsReviewed: count([reviewsRow]),
    sessionsCompleted: count([sessionsRow]),
    earliestSessionHour: earliest ? earliest.startedAt.getHours() : null,
  };
}

/* --- evaluation ---------------------------------------------------------- */

/**
 * Recompute every achievement against the current facts, persisting progress
 * and first-unlock timestamps. Called on read (and before a claim), so a bar
 * is already standing when the screen shows it and a fresh unlock is claimable
 * at once — no event plumbing, one writer, no missed unlock.
 */
export async function evaluateAchievements(profileId: string): Promise<AchievementStatus[]> {
  const facts = await gatherFacts(profileId);

  const rows = await db.orm
    .select()
    .from(userAchievements)
    .where(eq(userAchievements.userId, profileId));
  const byCode = new Map(rows.map((r) => [r.achievementCode, r]));

  const claimed = new Set(
    (
      await db.orm
        .select({ sourceId: xpLedger.sourceId })
        .from(xpLedger)
        .where(and(eq(xpLedger.userId, profileId), eq(xpLedger.reason, "achievement")))
    ).map((r) => r.sourceId),
  );

  const statuses: AchievementStatus[] = [];
  for (const a of ACHIEVEMENTS) {
    const { progress, target, unlocked } = achievementProgress(a.criteria, facts);
    const row = byCode.get(a.code);
    const nextProgress = Math.max(row?.progress ?? 0, progress);
    const unlockedAt = row?.unlockedAt ?? (unlocked ? new Date() : null);

    const changed =
      !row ||
      nextProgress !== (row.progress ?? 0) ||
      (unlockedAt !== null && row.unlockedAt === null);
    if (changed) {
      await db.orm
        .insert(userAchievements)
        .values({ userId: profileId, achievementCode: a.code, progress: nextProgress, unlockedAt })
        .onConflictDoUpdate({
          target: [userAchievements.userId, userAchievements.achievementCode],
          set: { progress: nextProgress, unlockedAt },
        });
    }

    statuses.push({
      code: a.code,
      name: a.name,
      description: a.description,
      xpReward: a.xpReward,
      progress: nextProgress,
      target,
      unlockedAt: unlockedAt ? unlockedAt.toISOString() : null,
      claimed: claimed.has(a.code),
    });
  }
  return statuses;
}

/* --- claim ---------------------------------------------------------------- */

/**
 * Pay out an unlocked achievement. Answers:
 * `null` — unknown code or still locked (the route maps this to 409),
 * `0`    — already claimed (the ledger already holds the row),
 * `>0`   — newly awarded XP.
 *
 * Evaluation runs first so an unlock earned seconds ago can be claimed
 * without waiting for the next read.
 */
export async function claimAchievement(profileId: string, code: string): Promise<number | null> {
  const catalogue = ACHIEVEMENTS.find((a): a is Achievement => a.code === code);
  if (!catalogue) return null;

  await evaluateAchievements(profileId);
  const [row] = await db.orm
    .select({ unlockedAt: userAchievements.unlockedAt })
    .from(userAchievements)
    .where(and(eq(userAchievements.userId, profileId), eq(userAchievements.achievementCode, code)))
    .limit(1);
  if (!row?.unlockedAt) return null;

  const [paid] = await db.orm
    .select({ id: xpLedger.id })
    .from(xpLedger)
    .where(
      and(
        eq(xpLedger.userId, profileId),
        eq(xpLedger.reason, "achievement"),
        eq(xpLedger.sourceType, "achievement"),
        eq(xpLedger.sourceId, code),
      ),
    )
    .limit(1);
  if (paid) return 0;

  return awardXp({
    userId: profileId,
    delta: catalogue.xpReward,
    reason: "achievement",
    sourceType: "achievement",
    sourceId: code,
  });
}

/**
 * Progress inputs and aggregates (P16, PRD §24–25).
 *
 * Two jobs, one file:
 *
 *  1. The honest inputs behind `@sq/core/progress`'s topic formula. The
 *     subject routes used to pass zeros for review coverage and a mastered
 *     status stand-in for quest completion — honest placeholders, flagged as
 *     landing "when P16 swaps the inputs". This is that swap: coverage comes
 *     from the cards themselves (reviewed at least once), quest completion
 *     from the topic's own quest steps (partial credit for count steps), and
 *     the subject bonus from genuinely completed subject quests.
 *
 *  2. The numbers the Progress page reads: study time (today / this week /
 *     per subject / per day), quiz history (scores over time, per-topic
 *     improvement, retry impact) and the §24 counts. Every aggregate is
 *     computed on read from the rows that caused it — nothing is
 *     denormalised (ADR-016's rule: compute, then cache where caching earns
 *     its keep; these tables are small enough that recompute is cheaper
 *     than a cache that can go stale).
 *
 * Day keys are UTC via `dayKey`, the same clock the streak and its calendar
 * keep, so "today" here can never disagree with "today" on the Home card.
 * Weeks start Monday (`weekStartKey`) — see PRD A.8.
 */
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { dayKey } from "@sq/core/gamification";
import { WEEK_GOAL_MINUTES, meanPercent, retryImpact, weekStartKey } from "@sq/core/progress";
import {
  flashcardDecks,
  flashcards,
  questSteps,
  quests,
  quizAttempts,
  quizzes,
  studySessions,
  subjects,
  tasks,
  topics,
} from "@sq/db/schema";

import { db } from "../db.ts";

const DAY = 86_400_000;
/** The heatmap and the trend line both look back this far. */
const HISTORY_DAYS = 90;

export interface DayMinutes {
  day: string;
  minutes: number;
}

export interface ProgressView {
  study: {
    todayMinutes: number;
    weekMinutes: number;
    /** Weekly goal in minutes — the same constant the formula divides by. */
    weekGoal: number;
    /** The heatmap's inclusive window, so client and server agree on it. */
    window: { from: string; to: string };
    /** Sparse: days with minutes > 0 only; the chart fills the quiet zeros. */
    days: DayMinutes[];
    bySubject: {
      id: string;
      name: string;
      monogram: string;
      minutes: number;
      days: DayMinutes[];
    }[];
  };
  quiz: {
    /** Graded attempts (total > 0), all time. */
    attempts: number;
    average: number | null;
    weekAverage: number | null;
    /** Scores over time, chronological, inside the window. */
    trend: { day: string; percent: number }[];
    byTopic: {
      topicId: string;
      topicName: string;
      attempts: number;
      average: number | null;
      /** Latest minus first attempt, percentage points; null below two attempts. */
      delta: number | null;
    }[];
    /** Did redoing a quiz help? Percentage points; see core's `retryImpact`. */
    retries: { retried: number; improved: number; avgDelta: number };
  };
  counts: {
    sessions: number;
    tasksCompleted: number;
    tasksOpen: number;
    questsCompleted: number;
    quizzesCompleted: number;
    subjectsStudied: number;
    topicsMastered: number;
  };
}

function sparseDays(map: Map<string, number> | undefined): DayMinutes[] {
  if (!map) return [];
  return [...map]
    .map(([day, minutes]) => ({ day, minutes }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export async function progressView(profileId: string, now = new Date()): Promise<ProgressView> {
  const todayKey = dayKey(now);
  const weekStart = weekStartKey(now);
  const windowFrom = dayKey(new Date(now.getTime() - (HISTORY_DAYS - 1) * DAY));

  /* --- study time: one pass over the session log -------------------------- */
  const [sessionRows, subjectRows] = await Promise.all([
    db.orm
      .select({
        subjectId: studySessions.subjectId,
        focusMin: studySessions.focusMin,
        endedAt: studySessions.endedAt,
      })
      .from(studySessions)
      .where(
        and(
          eq(studySessions.userId, profileId),
          eq(studySessions.status, "completed"),
          isNotNull(studySessions.endedAt),
        ),
      ),
    db.orm
      .select({ id: subjects.id, name: subjects.name, monogram: subjects.monogram })
      .from(subjects)
      .where(eq(subjects.userId, profileId)),
  ]);

  const daysMap = new Map<string, number>();
  const subjectDays = new Map<string, Map<string, number>>();
  const minutesBySubject = new Map<string, number>();
  const studiedSubjects = new Set<string>();
  let todayMinutes = 0;
  let weekMinutes = 0;

  for (const row of sessionRows) {
    if (!row.endedAt) continue;
    const key = dayKey(row.endedAt);
    if (key >= windowFrom) daysMap.set(key, (daysMap.get(key) ?? 0) + row.focusMin);
    if (key === todayKey) todayMinutes += row.focusMin;
    if (key >= weekStart) weekMinutes += row.focusMin;
    if (row.subjectId) {
      studiedSubjects.add(row.subjectId);
      minutesBySubject.set(
        row.subjectId,
        (minutesBySubject.get(row.subjectId) ?? 0) + row.focusMin,
      );
      if (key >= windowFrom) {
        const perDay = subjectDays.get(row.subjectId) ?? new Map<string, number>();
        perDay.set(key, (perDay.get(key) ?? 0) + row.focusMin);
        subjectDays.set(row.subjectId, perDay);
      }
    }
  }

  /* --- quiz history: attempts over their parent quizzes ------------------- */
  const attemptRows = await db.orm
    .select({
      quizId: quizAttempts.quizId,
      score: quizAttempts.score,
      total: quizAttempts.total,
      completedAt: quizAttempts.completedAt,
      retryOf: quizzes.retryOf,
      topicId: quizzes.topicId,
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
    .where(and(eq(quizAttempts.userId, profileId), isNotNull(quizAttempts.completedAt)))
    .orderBy(asc(quizAttempts.completedAt));

  const graded = attemptRows.filter(
    (a): a is typeof a & { completedAt: Date } => a.total > 0 && a.completedAt !== null,
  );

  const owned = new Set(subjectRows.map((s) => s.id));
  const topicRows =
    owned.size === 0
      ? []
      : await db.orm
          .select({ id: topics.id, name: topics.name, subjectId: topics.subjectId })
          .from(topics)
          .where(inArray(topics.subjectId, [...owned]));
  const topicName = new Map(topicRows.map((t) => [t.id, t.name]));

  interface TopicRuns {
    attempts: { score: number; total: number }[];
    first: number;
    last: number;
  }
  const perTopic = new Map<string, TopicRuns>();
  for (const a of graded) {
    if (!a.topicId || !topicName.has(a.topicId)) continue;
    const percent = (a.score / a.total) * 100;
    const run = perTopic.get(a.topicId);
    if (run) {
      run.attempts.push({ score: a.score, total: a.total });
      run.last = percent;
    } else {
      perTopic.set(a.topicId, {
        attempts: [{ score: a.score, total: a.total }],
        first: percent,
        last: percent,
      });
    }
  }

  // Retry impact: each retry quiz's latest attempt against the original
  // attempt it was redoing — the last one submitted before the redo — which
  // mirrors the comparison the submit route shows (and the one the
  // `retry_improved` award was judged on).
  const latestByQuiz = new Map<string, (typeof graded)[number]>();
  for (const a of graded) latestByQuiz.set(a.quizId, a);
  const pairs: {
    original: { score: number; total: number };
    retry: { score: number; total: number };
  }[] = [];
  for (const retry of latestByQuiz.values()) {
    if (!retry.retryOf) continue;
    let origin: (typeof graded)[number] | null = null;
    for (let i = graded.length - 1; i >= 0; i -= 1) {
      const candidate = graded[i];
      if (
        candidate &&
        candidate.quizId === retry.retryOf &&
        candidate.completedAt <= retry.completedAt
      ) {
        origin = candidate;
        break;
      }
    }
    if (origin) pairs.push({ original: origin, retry });
  }

  /* --- the §24 counts ------------------------------------------------------ */
  const [taskCounts, questCounts, mastered] = await Promise.all([
    db.orm
      .select({ status: tasks.status, n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(eq(tasks.userId, profileId))
      .groupBy(tasks.status),
    db.orm
      .select({ status: quests.status, n: sql<number>`count(*)::int` })
      .from(quests)
      .where(eq(quests.userId, profileId))
      .groupBy(quests.status),
    owned.size === 0
      ? Promise.resolve([{ n: 0 }])
      : db.orm
          .select({ n: sql<number>`count(*)::int` })
          .from(topics)
          .where(and(inArray(topics.subjectId, [...owned]), eq(topics.status, "mastered"))),
  ]);
  const countOf = (rows: { status: string; n: number }[], status: string) =>
    rows.find((r) => r.status === status)?.n ?? 0;

  return {
    study: {
      todayMinutes,
      weekMinutes,
      weekGoal: WEEK_GOAL_MINUTES,
      window: { from: windowFrom, to: todayKey },
      days: sparseDays(daysMap),
      bySubject: subjectRows
        .map((s) => ({
          id: s.id,
          name: s.name,
          monogram: s.monogram,
          minutes: minutesBySubject.get(s.id) ?? 0,
          days: sparseDays(subjectDays.get(s.id)),
        }))
        .filter((s) => s.minutes > 0)
        .sort((a, b) => b.minutes - a.minutes),
    },
    quiz: {
      attempts: graded.length,
      average: meanPercent(graded),
      weekAverage: meanPercent(graded.filter((a) => dayKey(a.completedAt) >= weekStart)),
      trend: graded
        .filter((a) => dayKey(a.completedAt) >= windowFrom)
        .map((a) => ({ day: dayKey(a.completedAt), percent: (a.score / a.total) * 100 })),
      byTopic: [...perTopic]
        .map(([topicId, run]) => ({
          topicId,
          topicName: topicName.get(topicId) ?? "",
          attempts: run.attempts.length,
          average: meanPercent(run.attempts),
          delta: run.attempts.length >= 2 ? run.last - run.first : null,
        }))
        .sort((a, b) => a.topicName.localeCompare(b.topicName)),
      retries: retryImpact(pairs),
    },
    counts: {
      sessions: sessionRows.filter((r) => r.endedAt !== null).length,
      tasksCompleted: countOf(taskCounts, "done"),
      tasksOpen: countOf(taskCounts, "open"),
      questsCompleted: countOf(questCounts, "completed"),
      quizzesCompleted: new Set(graded.map((a) => a.quizId)).size,
      subjectsStudied: studiedSubjects.size,
      topicsMastered: mastered[0]?.n ?? 0,
    },
  };
}

/* --- the formula's inputs (§18.3) ----------------------------------------- */

/**
 * Share of each topic's cards reviewed at least once — review coverage.
 *
 * Ownership travels through the deck, the same join every card query uses;
 * `topicId` is copied onto cards when they are saved, so it is the topic key.
 */
export async function reviewCoverageByTopic(
  profileId: string,
  topicIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (topicIds.length === 0) return out;

  const rows = await db.orm
    .select({
      topicId: flashcards.topicId,
      total: sql<number>`count(*)::int`,
      reviewed: sql<number>`count(*) filter (where ${flashcards.lastReviewedAt} is not null)::int`,
    })
    .from(flashcards)
    .innerJoin(flashcardDecks, eq(flashcards.deckId, flashcardDecks.id))
    .where(and(eq(flashcardDecks.userId, profileId), inArray(flashcards.topicId, topicIds)))
    .groupBy(flashcards.topicId);

  for (const row of rows) {
    if (row.topicId && row.total > 0) out.set(row.topicId, row.reviewed / row.total);
  }
  return out;
}

/**
 * Share of the topic's quest steps completed — count steps earn partial
 * credit (`progress` against `target`), single steps count when done.
 * Completed quests keep their rows, so a finished quest still contributes.
 */
export async function questCompletionByTopic(
  profileId: string,
  topicIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (topicIds.length === 0) return out;

  const questRows = await db.orm
    .select({ id: quests.id, scopeId: quests.scopeId })
    .from(quests)
    .where(
      and(
        eq(quests.userId, profileId),
        eq(quests.scopeType, "topic"),
        inArray(quests.scopeId, topicIds),
      ),
    );
  if (questRows.length === 0) return out;

  const scopeOf = new Map(
    questRows.filter((q) => q.scopeId !== null).map((q) => [q.id, q.scopeId]),
  );
  const stepRows = await db.orm
    .select({
      questId: questSteps.questId,
      target: questSteps.target,
      progress: questSteps.progress,
    })
    .from(questSteps)
    .where(
      inArray(
        questSteps.questId,
        questRows.map((q) => q.id),
      ),
    );

  const done = new Map<string, number>();
  const target = new Map<string, number>();
  for (const step of stepRows) {
    const topicId = scopeOf.get(step.questId);
    if (!topicId) continue;
    const goal = Math.max(1, step.target);
    const got = Math.min(goal, Math.max(0, step.progress));
    done.set(topicId, (done.get(topicId) ?? 0) + got);
    target.set(topicId, (target.get(topicId) ?? 0) + goal);
  }
  for (const [topicId, goal] of target) {
    if (goal > 0) out.set(topicId, (done.get(topicId) ?? 0) / goal);
  }
  return out;
}

/** Completed subject-scoped quests, for subjectProgress's +0.1 each (§25). */
export async function completedSubjectQuests(
  profileId: string,
  subjectIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (subjectIds.length === 0) return out;

  const rows = await db.orm
    .select({ scopeId: quests.scopeId, n: sql<number>`count(*)::int` })
    .from(quests)
    .where(
      and(
        eq(quests.userId, profileId),
        eq(quests.scopeType, "subject"),
        eq(quests.status, "completed"),
        inArray(quests.scopeId, subjectIds),
      ),
    )
    .groupBy(quests.scopeId);

  for (const row of rows) if (row.scopeId) out.set(row.scopeId, row.n);
  return out;
}

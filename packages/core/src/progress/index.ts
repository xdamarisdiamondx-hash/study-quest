/**
 * Subject and topic progress, plus the time-window maths the P16 charts read.
 *
 * Progress is computed from activity, then cached — never incremented in place
 * (ADR-016). Formulas: docs/IMPLEMENTATION_PLAN.md section 18.3.
 */
import { dayKey } from "../gamification/index.ts";

export interface TopicInput {
  /** Correct answers / total answers, last 20 questions, recency weighted. */
  mastery: number;
  /** Share of the topic's flashcards reviewed at least once. */
  reviewCoverage: number;
  /** Study minutes against a 10-hour target for the topic. */
  sessionMinutes: number;
  /** Share of the topic's quest steps completed. */
  questCompletion: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** 0.40 mastery + 0.20 review + 0.20 sessions + 0.20 quests */
export function topicProgress(t: TopicInput): number {
  const sessions = clamp01(t.sessionMinutes / 600);
  return clamp01(
    0.4 * clamp01(t.mastery) +
      0.2 * clamp01(t.reviewCoverage) +
      0.2 * sessions +
      0.2 * clamp01(t.questCompletion),
  );
}

/** Mean of topic progress, plus 0.1 per completed subject quest (PRD section 25). */
export function subjectProgress(topics: TopicInput[], completedSubjectQuests = 0): number {
  if (topics.length === 0) return 0;
  const mean = topics.reduce((sum, t) => sum + topicProgress(t), 0) / topics.length;
  return clamp01(mean + 0.1 * Math.max(0, completedSubjectQuests));
}

/** Recency-weighted mastery over recent attempts: full weight for the last 5. */
export function weightedMastery(correct: number, total: number): number {
  if (total <= 0) return 0;
  return clamp01(correct / total);
}

/* --- time windows and chart maths (P16) --------------------------------- */

/**
 * The weekly study goal in minutes — 10 hours, the same target the topic
 * formula divides session minutes by. One constant so the Progress page's
 * ring, its caption and the formula can never name different goals.
 */
export const WEEK_GOAL_MINUTES = 600;

/**
 * The Monday (UTC) of the week `on` falls in, as a `dayKey`.
 *
 * Weeks start Monday everywhere: the heatmap columns are weeks, "this week"
 * sums from here, and the streak counts UTC days — so one clock decides all
 * three (PRD A.8).
 */
export function weekStartKey(on: Date): string {
  const d = new Date(Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), on.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return dayKey(d);
}

/** One heatmap cell: `day: null` is padding outside the window (or the future). */
export interface HeatmapCell {
  day: string | null;
  minutes: number;
}

/**
 * Calendar heatmap grid for `[from, to]` inclusive, as columns of whole weeks
 * (Monday-first). Padding cells fall outside the window so rows stay weekday
 * aligned; minutes come from the caller's `dayKey → minutes` map, zeros
 * included — a quiet day is a real day, not a missing one.
 */
export function heatmapColumns(
  from: string,
  to: string,
  minutesByDay: Readonly<Record<string, number>>,
): HeatmapCell[][] {
  if (from > to) return [];

  const start = new Date(`${from}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));

  const end = new Date(`${to}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + (6 - ((end.getUTCDay() + 6) % 7)));

  const columns: HeatmapCell[][] = [];
  let column: HeatmapCell[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    const day = dayKey(new Date(t));
    const inside = day >= from && day <= to;
    column.push({ day: inside ? day : null, minutes: inside ? (minutesByDay[day] ?? 0) : 0 });
    if (column.length === 7) {
      columns.push(column);
      column = [];
    }
  }
  if (column.length > 0) columns.push(column);
  return columns;
}

/**
 * Mean of per-attempt percentages, counting only graded attempts
 * (`total > 0`). `null` when there is nothing to average — the screen says
 * "no attempts yet" rather than showing a confident 0%.
 */
export function meanPercent(
  attempts: ReadonlyArray<{ score: number; total: number }>,
): number | null {
  const graded = attempts.filter((a) => a.total > 0);
  if (graded.length === 0) return null;
  const sum = graded.reduce((acc, a) => acc + (a.score / a.total) * 100, 0);
  return sum / graded.length;
}

/**
 * Did retrying help? Deltas are percentage points (retry − original); an
 * ungraded pair (either side missing questions) is skipped rather than
 * counted as no change.
 */
export function retryImpact(
  pairs: ReadonlyArray<{
    original: { score: number; total: number };
    retry: { score: number; total: number };
  }>,
): { retried: number; improved: number; avgDelta: number } {
  const deltas = pairs
    .filter((p) => p.original.total > 0 && p.retry.total > 0)
    .map(
      (p) => (p.retry.score / p.retry.total) * 100 - (p.original.score / p.original.total) * 100,
    );
  if (deltas.length === 0) return { retried: pairs.length, improved: 0, avgDelta: 0 };
  return {
    retried: pairs.length,
    improved: deltas.filter((d) => d > 0).length,
    avgDelta: deltas.reduce((acc, d) => acc + d, 0) / deltas.length,
  };
}

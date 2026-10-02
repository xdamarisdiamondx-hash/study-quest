/**
 * Subject and topic progress.
 *
 * Progress is computed from activity, then cached — never incremented in place
 * (ADR-016). Formulas: docs/IMPLEMENTATION_PLAN.md section 18.3.
 */

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

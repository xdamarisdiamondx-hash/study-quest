/**
 * The recommendation rules (P17, PRD §27) — a pure ranking over signals the
 * server already reads elsewhere.
 *
 * Every suggestion is a fact the app can point at: a deadline that passed, a
 * score that came back low, a topic gone quiet, a quest with steps waiting.
 * The engine only decides which facts are worth the student's attention right
 * now and in what order — deterministic scores, no randomness, no model, so a
 * test can pin every word (§27 asks for helpful, not overwhelming; ADR-016
 * asks for numbers that trace to their rows).
 *
 * Two contexts share one rule set:
 *  - `"home"` — the What's next card: deadlines, weak scores, quiet topics,
 *    the quest to continue, streak protection. Day remainder is excluded here
 *    because Today's Quest already shows it.
 *  - `"after"` — the strip after a completed activity: what to do *next*
 *    (next quiz, review, quest step, the rest of the day) rather than what is
 *    merely urgent. Deadlines and streaks stay out — not what you want to read
 *    the moment you finish something.
 *
 * Anti-spam is part of the design, not a filter bolted on: at most
 * `MAX_SUGGESTIONS` ever come out, rules that need history stay silent until
 * there is history (`everStudied`), and a first-run account with nothing in it
 * has no signal to fire.
 */
import { dueLabel, startOfDay } from "../tasks/index.ts";
import type { TaskSnapshot, TopicSnapshot } from "./index.ts";

export const MAX_SUGGESTIONS = 3;
/** A weak score older than this is history, not a recommendation. */
const WEAK_WINDOW_DAYS = 14;
/** A topic quieter than this is worth naming. */
const STALE_DAYS = 7;
/** Below this on the student's latest attempt, the topic wants a review. */
const WEAK_SCORE = 0.7;

const DAY_MS = 86_400_000;

export const RECOMMENDATION_CODES = [
  "overdue",
  "due_soon",
  "weak_quiz",
  "stale_review",
  "next_quiz",
  "next_step",
  "day_remainder",
  "streak_keep",
] as const;

export type RecommendationCode = (typeof RECOMMENDATION_CODES)[number];

export interface Recommendation {
  code: RecommendationCode;
  /** The fact, stated plainly — no praise, no scolding (§33). */
  text: string;
  /** Verb-first label for the button that acts on it. */
  action: string;
  /** App-relative deep link with the context already picked out. */
  href: string;
  /** Rule score — the engine returns the top `MAX_SUGGESTIONS`. */
  score: number;
}

/** The student's latest graded attempt on each topic (server picks "latest"). */
export interface AttemptSignal {
  topicId: string;
  score: number;
  total: number;
  /** ISO instant of the attempt. */
  completedAt: string;
}

/** The active quest worth continuing, and how far along it is. */
export interface QuestSignal {
  title: string;
  /** Deep link into the quest itself. */
  href: string;
  stepDone: number;
  stepTotal: number;
}

/** Today's plan as the quest sees it — unfinished work only. */
export interface DaySignal {
  pending: number;
  total: number;
}

export interface RecommendInput {
  now: Date;
  /** Open tasks — undated ones are ignored; a deadline beats an intention. */
  tasks: readonly TaskSnapshot[];
  topicsById: Record<string, TopicSnapshot>;
  attempts: readonly AttemptSignal[];
  /** The streak counted today (its own day key), so protection stays silent. */
  studiedToday: boolean;
  streak: number;
  /** Any real study ever — gates the rules that nudge a returning student. */
  everStudied: boolean;
  quest: QuestSignal | null;
  day: DaySignal | null;
}

export type RecommendContext = "home" | "after";

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Lowercase the day word only — "Fri" stays a name, not a stutter. */
const dayWord = (label: string) =>
  label === "Today" || label === "Tomorrow" || label === "Yesterday" ? lower(label) : label;

/** Whole calendar days from `now` to `at` (negative = in the past). */
function daysFrom(now: Date, at: string | Date): number {
  const then = typeof at === "string" ? new Date(at) : at;
  return Math.round((startOfDay(then).getTime() - startOfDay(now).getTime()) / DAY_MS);
}

const studyTab = (topic: TopicSnapshot, tab: string) =>
  topic.subjectId ? `/study/${topic.subjectId}?tab=${tab}` : "/study";

/** Deadlines that passed, bundled into one line — one nudge, not one per task. */
function overdueRule(input: RecommendInput): Recommendation | null {
  const past = input.tasks.filter((t) => t.dueAt && daysFrom(input.now, t.dueAt) < 0);
  if (past.length === 0) return null;

  const worst = past.reduce((a, b) =>
    daysFrom(input.now, a.dueAt as string) <= daysFrom(input.now, b.dueAt as string) ? a : b,
  );
  const overdueDays = -daysFrom(input.now, worst.dueAt as string);
  const label = dayWord(dueLabel(worst.dueAt, input.now));
  const text =
    past.length === 1
      ? `Your ${worst.title} was due ${label}.`
      : `${past.length} tasks are overdue — the oldest was due ${label}.`;

  return {
    code: "overdue",
    text,
    action: "Open tasks",
    href: worst.subjectId ? `/tasks?subject=${worst.subjectId}` : "/tasks",
    score: 90 + Math.min(overdueDays, 7),
  };
}

/** Due today or tomorrow, bundled the same way. */
function dueSoonRule(input: RecommendInput): Recommendation | null {
  const soon = input.tasks.filter((t) => {
    if (!t.dueAt) return false;
    const d = daysFrom(input.now, t.dueAt);
    return d >= 0 && d <= 1;
  });
  if (soon.length === 0) return null;

  const todayCount = soon.filter((t) => daysFrom(input.now, t.dueAt as string) === 0).length;
  const tomorrowCount = soon.length - todayCount;
  const label =
    todayCount > 0 && tomorrowCount > 0
      ? "today or tomorrow"
      : todayCount > 0
        ? "today"
        : "tomorrow";
  const first =
    (todayCount > 0
      ? soon.find((t) => daysFrom(input.now, t.dueAt as string) === 0)
      : soon.find((t) => daysFrom(input.now, t.dueAt as string) === 1)) ?? soon[0];
  if (!first) return null;

  const text =
    soon.length === 1
      ? `Your ${first.title} is due ${label}.`
      : `${soon.length} tasks are due ${label}.`;

  return {
    code: "due_soon",
    text,
    action: "Open tasks",
    href: first.subjectId ? `/tasks?subject=${first.subjectId}` : "/tasks",
    score: todayCount > 0 ? 78 : 72,
  };
}

/** The most recent weak attempt across topics, inside the window (§27's example). */
function weakQuizRule(input: RecommendInput): Recommendation | null {
  const cutoff = input.now.getTime() - WEAK_WINDOW_DAYS * DAY_MS;
  let pick: { attempt: AttemptSignal; topic: TopicSnapshot; pct: number } | null = null;

  for (const attempt of input.attempts) {
    if (attempt.total <= 0) continue;
    const pct = attempt.score / attempt.total;
    if (pct >= WEAK_SCORE) continue;
    if (Date.parse(attempt.completedAt) < cutoff) continue;
    const topic = input.topicsById[attempt.topicId];
    if (!topic) continue;
    if (!pick || Date.parse(attempt.completedAt) > Date.parse(pick.attempt.completedAt)) {
      pick = { attempt, topic, pct };
    }
  }
  if (!pick) return null;

  return {
    code: "weak_quiz",
    text: `You scored ${pick.attempt.score}/${pick.attempt.total} on your last ${pick.topic.name} quiz.`,
    action: "Try a quick review",
    href: studyTab(pick.topic, "quizzes"),
    score: 60 + Math.round((1 - pick.pct) * 30),
  };
}

/** A topic with cards that has gone quiet (§27's "You haven't reviewed X recently"). */
function staleReviewRule(input: RecommendInput): Recommendation | null {
  if (!input.everStudied) return null;

  let pick: { topic: TopicSnapshot; days: number | null } | null = null;
  for (const topic of Object.values(input.topicsById)) {
    if (topic.assets.cards === 0) continue;
    const days =
      topic.lastStudiedAt === null ? null : Math.max(0, -daysFrom(input.now, topic.lastStudiedAt));
    if (days !== null && days < STALE_DAYS) continue;
    const candidate = days === null ? Infinity : days;
    if (pick !== null) {
      const stalest = pick.days === null ? Infinity : pick.days;
      if (candidate <= stalest) continue;
    }
    pick = { topic, days };
  }
  if (!pick) return null;

  return {
    code: "stale_review",
    text:
      pick.days === null
        ? `You haven't reviewed ${pick.topic.name} yet.`
        : `You haven't reviewed ${pick.topic.name} recently.`,
    action: "Review cards",
    href: studyTab(pick.topic, "flashcards"),
    score: pick.days === null ? 58 : 50 + Math.min(pick.days, 10),
  };
}

/** A quiz that exists and has never been attempted — the easy next thing. */
function nextQuizRule(input: RecommendInput): Recommendation | null {
  const candidates = Object.values(input.topicsById)
    .filter((t) => t.assets.quizzes > 0 && t.mastery === null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const topic = candidates[0];
  if (!topic) return null;

  return {
    code: "next_quiz",
    text: `${topic.name} has a quiz you haven't tried.`,
    action: "Take the quiz",
    href: studyTab(topic, "quizzes"),
    score: 57,
  };
}

/** The waiting step of an in-progress quest. */
function nextStepRule(input: RecommendInput): Recommendation | null {
  const quest = input.quest;
  if (!quest || quest.stepTotal === 0 || quest.stepDone >= quest.stepTotal) return null;

  return {
    code: "next_step",
    text: `Continue ${quest.title} — step ${quest.stepDone + 1} of ${quest.stepTotal}.`,
    action: "Open quest",
    href: quest.href,
    score: 65,
  };
}

/** What is left of today's quest — the strip's answer after any completion. */
function dayRemainderRule(input: RecommendInput): Recommendation | null {
  const day = input.day;
  if (!input.everStudied || !day || day.pending === 0) return null;

  return {
    code: "day_remainder",
    text: `${day.pending} item${day.pending === 1 ? "" : "s"} left in today's quest.`,
    action: "Finish the day",
    href: "/plan",
    score: 40 + Math.min(day.pending, 6),
  };
}

/** A live streak with nothing studied today yet (§27's "keep your streak going"). */
function streakKeepRule(input: RecommendInput): Recommendation | null {
  if (!input.everStudied || input.studiedToday || input.streak < 2) return null;

  return {
    code: "streak_keep",
    text: `You've studied ${input.streak} days in a row — keep it going.`,
    action: "Start a session",
    href: "/sessions",
    score: 42 + Math.min(input.streak, 14),
  };
}

const RULES: Record<RecommendationCode, (input: RecommendInput) => Recommendation | null> = {
  overdue: overdueRule,
  due_soon: dueSoonRule,
  weak_quiz: weakQuizRule,
  stale_review: staleReviewRule,
  next_quiz: nextQuizRule,
  next_step: nextStepRule,
  day_remainder: dayRemainderRule,
  streak_keep: streakKeepRule,
};

/** What each surface is allowed to say — see the module note. */
const CONTEXT_CODES: Record<RecommendContext, readonly RecommendationCode[]> = {
  home: [
    "overdue",
    "due_soon",
    "weak_quiz",
    "stale_review",
    "next_quiz",
    "next_step",
    "streak_keep",
  ],
  after: ["weak_quiz", "stale_review", "next_quiz", "next_step", "day_remainder"],
};

/**
 * The ranked suggestions for a surface: highest score first, ties broken by
 * catalogue order, capped at `MAX_SUGGESTIONS`. Empty input yields an empty
 * list — a first-run account is never preached at.
 */
export function recommend(
  input: RecommendInput,
  context: RecommendContext = "home",
): Recommendation[] {
  const allowed = CONTEXT_CODES[context];
  const out: Recommendation[] = [];
  for (const code of allowed) {
    const suggestion = RULES[code](input);
    if (suggestion) out.push(suggestion);
  }
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return RECOMMENDATION_CODES.indexOf(a.code) - RECOMMENDATION_CODES.indexOf(b.code);
  });
  return out.slice(0, MAX_SUGGESTIONS);
}

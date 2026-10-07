/**
 * XP, levels, streaks and achievements.
 * Rules and rationale: docs/IMPLEMENTATION_PLAN.md section 18.3, ADR-015.
 */

/**
 * Total XP required to *reach* a level. Level 1 starts at 0, so the first level
 * costs 100 XP to leave rather than 255.
 */
export function xpRequired(level: number): number {
  const steps = Math.max(0, level - 1);
  return steps === 0 ? 0 : Math.round(100 * Math.pow(steps, 1.35));
}

/** The highest level whose cumulative XP requirement is <= totalXp. */
export function levelForXp(totalXp: number): number {
  let level = 1;
  while (level < 99 && xpRequired(level + 1) <= totalXp) level += 1;
  return level;
}

/** Progress toward the next level, as 0..1. */
export function levelProgress(totalXp: number): {
  level: number;
  into: number;
  needed: number;
  fraction: number;
} {
  const level = levelForXp(totalXp);
  const floor = xpRequired(level);
  const ceil = xpRequired(level + 1);
  const into = totalXp - floor;
  const needed = ceil - floor;
  return { level, into, needed, fraction: needed === 0 ? 0 : into / needed };
}

export const LEVEL_TITLES = [
  "Newcomer",
  "Explorer",
  "Apprentice",
  "Scholar",
  "Adept",
  "Strategist",
  "Champion",
  "Master",
] as const;

export function levelTitle(level: number): string {
  return LEVEL_TITLES[Math.min(Math.max(level, 1), LEVEL_TITLES.length) - 1] ?? "Newcomer";
}

/* --- XP awards (PRD section 22) ----------------------------------------- */

export const XP = {
  quizAttempt: 10,
  quizHighScore: 25,
  retryImproved: 15,
  session: 100,
  focusSessionPerTenMinutes: 2,
  flashcardBatch: 15,
  task: 10,
  questStep: 20,
  questComplete: 500,
} as const;

/* --- achievements (PRD section 23) --------------------------------------- */

/**
 * What an achievement's criteria can count. Every value is a fact the server
 * can gather from rows it already owns — nothing here is derived from a screen.
 */
export interface AchievementFacts {
  questsCompleted: number;
  /** Distinct quizzes with at least one graded attempt — retakes are one quiz. */
  quizzesCompleted: number;
  streakDays: number;
  subjectsStudied: number;
  improvedAfterRetry: boolean;
  notesCreated: number;
  flashcardsReviewed: number;
  sessionsCompleted: number;
  /** Local hour of the earliest completed session, or null when there is none. */
  earliestSessionHour: number | null;
}

export type AchievementCriteria = Partial<{
  [K in keyof AchievementFacts]: number | boolean;
}>;

export interface Achievement {
  code: string;
  name: string;
  description: string;
  xpReward: number;
  criteria: AchievementCriteria;
}

/**
 * The catalogue — one source the seed writes into the `achievements` table and
 * the evaluator reads back (the same pattern as QUEST_TEMPLATES). The five PRD
 * §23 examples plus five more, each counting real learning: the criteria never
 * mention opening the app (§23, anti-pattern check).
 */
export const ACHIEVEMENTS: readonly Achievement[] = [
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
    code: "first_session",
    name: "First Session",
    description: "Finish your first study session.",
    xpReward: 25,
    criteria: { sessionsCompleted: 1 },
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
    criteria: { earliestSessionHour: 8 },
  },
  {
    code: "unstoppable",
    name: "Unstoppable",
    description: "Study for 30 days in a row.",
    xpReward: 250,
    criteria: { streakDays: 30 },
  },
];

/**
 * How far along one achievement is for these facts.
 *
 * Numeric criteria count up to their target (`progress` is clamped so a screen
 * can show a full bar before the unlock); booleans and the "before hour" test
 * are all-or-nothing. Every criteria entry must be met — unlocked means the
 * whole requirement, never half of it.
 */
export function achievementProgress(
  criteria: AchievementCriteria,
  facts: AchievementFacts,
): { progress: number; target: number; unlocked: boolean } {
  const entries = Object.entries(criteria) as [keyof AchievementFacts, number | boolean][];
  if (entries.length === 0) return { progress: 0, target: 0, unlocked: false };

  let progress = 0;
  let target = 0;
  let unlocked = true;

  for (const [key, requirement] of entries) {
    const fact = facts[key];
    if (typeof requirement === "number" && key !== "earliestSessionHour") {
      const value = typeof fact === "number" ? fact : 0;
      progress += Math.min(value, requirement);
      target += requirement;
      if (value < requirement) unlocked = false;
    } else if (key === "earliestSessionHour" && typeof requirement === "number") {
      // "Before 8am": any early session satisfies it; a later one never counts.
      const met = fact !== null && typeof fact === "number" && fact < requirement;
      progress += met ? 1 : 0;
      target += 1;
      if (!met) unlocked = false;
    } else {
      const met = fact === requirement;
      progress += met ? 1 : 0;
      target += 1;
      if (!met) unlocked = false;
    }
  }

  return { progress, target, unlocked };
}

/* --- streaks (PRD section 22) ------------------------------------------ */

export interface StreakState {
  current: number;
  longest: number;
  lastActiveDate: string | null;
  freezeCount: number;
}

const DAY = 86_400_000;

/**
 * A day's key in the streak's own calendar (the UTC date). Exported so any
 * calendar drawn from it — the streak grid, P15 — uses the exact boundary
 * `registerActivity` counts and can never disagree with the streak it shows.
 */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * A day counts as active once the user completes a qualifying action. One freeze per
 * 14 days is granted automatically and can absorb a single missed day.
 *
 * Streaks are calendar days, not elapsed hours: both dates are reduced to UTC midnight
 * before the gap is measured, so an afternoon activity is still "today" and does not
 * read as a missed day.
 */
export function registerActivity(state: StreakState, on: Date): StreakState {
  const today = dayKey(on);
  if (state.lastActiveDate === today) return state;

  const midnightUtc = (key: string) => new Date(`${key}T00:00:00Z`).getTime();
  const gapDays = state.lastActiveDate
    ? Math.round((midnightUtc(today) - midnightUtc(state.lastActiveDate)) / DAY)
    : Infinity;

  let current: number;
  let freezeCount = state.freezeCount;

  if (gapDays === 1) {
    current = state.current + 1;
  } else if (gapDays === 2 && freezeCount > 0) {
    current = state.current + 1; // the frozen day in between
    freezeCount -= 1; // a freeze is spent, not reused
  } else {
    current = 1;
  }

  // Grant one freeze for every 14 days of streak, capped at 3 held at once.
  freezeCount = Math.min(3, freezeCount + (current % 14 === 0 ? 1 : 0));

  return { current, longest: Math.max(state.longest, current), lastActiveDate: today, freezeCount };
}

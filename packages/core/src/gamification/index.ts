/**
 * XP, levels and streaks.
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

/* --- streaks (PRD section 22) ------------------------------------------ */

export interface StreakState {
  current: number;
  longest: number;
  lastActiveDate: string | null;
  freezeCount: number;
}

const DAY = 86_400_000;

function toKey(d: Date): string {
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
  const today = toKey(on);
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

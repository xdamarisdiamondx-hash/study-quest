/**
 * Typed client for the gamification API (P15): the shared view — level, streak,
 * the days the streak counted, and all ten achievements — plus the one write it
 * accepts, a claim. The view is read by Home, Progress and the level watcher at
 * once, so it lives behind one key everywhere (ADR-010: one contract).
 */
import { ApiError } from "./subjectsApi";

export interface AchievementView {
  code: string;
  name: string;
  description: string;
  xpReward: number;
  /** High-water progress toward `target`; equal to `target` once unlocked. */
  progress: number;
  target: number;
  /** ISO timestamp of the unlock, or null while still locked. */
  unlockedAt: string | null;
  claimed: boolean;
}

export interface StreakView {
  current: number;
  longest: number;
  /** UTC day key (YYYY-MM-DD) of the last day the streak counted, or null. */
  lastActiveDate: string | null;
  freezeCount: number;
}

export interface GamificationView {
  totalXp: number;
  level: { level: number; title: string; into: number; needed: number; fraction: number };
  streak: StreakView;
  /** UTC day keys the streak has counted, newest first — the streak calendar. */
  activeDays: string[];
  achievements: AchievementView[];
}

export interface ClaimResult {
  code: string;
  xp: number;
  claimed: true;
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) throw new ApiError(fallback, res.status);
  return res.json() as Promise<T>;
}

export const gamificationApi = {
  view: () =>
    fetch("/api/gamification", { credentials: "same-origin" }).then((r) =>
      json<GamificationView>(r, "Failed to load your progress"),
    ),

  claim: (code: string) =>
    fetch("/api/gamification/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ code }),
    }).then((r) => json<ClaimResult>(r, "Could not claim the achievement")),
};

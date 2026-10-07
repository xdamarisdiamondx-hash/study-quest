/**
 * The gamification view (P15, PRD §22–24) — one read the Progress page, the
 * Home card and the level watcher all share.
 *
 * Everything here is derived, never denormalised: total XP is a sum over the
 * ledger, the level is that sum through the core curve, and the calendar is
 * `activity_log` — one row per day the *streak* counted, so the grid depicts
 * exactly what the streak counted and no day can be added by opening the app
 * (the anti-pattern line in §22).
 */
import { and, desc, eq, gte } from "drizzle-orm";

import { dayKey, levelProgress, levelTitle, type StreakState } from "@sq/core/gamification";
import { activityLog } from "@sq/db/schema";

import { db } from "../db.ts";
import { evaluateAchievements, type AchievementStatus } from "./achievements.ts";
import { loadStreak, totalXp } from "./xp.ts";

export interface GamificationView {
  totalXp: number;
  level: { level: number; title: string; into: number; needed: number; fraction: number };
  streak: StreakState;
  /** Day keys the streak has counted, newest first (the streak calendar). */
  activeDays: string[];
  achievements: AchievementStatus[];
}

/** Days of history the calendar needs: a month grid plus the streak's tail. */
const CALENDAR_WINDOW_DAYS = 45;

export async function gamificationView(profileId: string): Promise<GamificationView> {
  const [xp, streak, achievements] = await Promise.all([
    totalXp(profileId),
    loadStreak(profileId),
    evaluateAchievements(profileId),
  ]);

  const progress = levelProgress(xp);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CALENDAR_WINDOW_DAYS);

  const dayRows = await db.orm
    .select({ createdAt: activityLog.createdAt })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.userId, profileId),
        eq(activityLog.kind, "study_day"),
        gte(activityLog.createdAt, cutoff),
      ),
    )
    .orderBy(desc(activityLog.createdAt));

  const activeDays = [...new Set(dayRows.map((r) => dayKey(r.createdAt)))];

  return {
    totalXp: xp,
    level: {
      level: progress.level,
      title: levelTitle(progress.level),
      into: progress.into,
      needed: progress.needed,
      fraction: progress.fraction,
    },
    streak,
    activeDays,
    achievements,
  };
}

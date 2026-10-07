/**
 * Placeholder data for the shell.
 *
 * Subjects, topics and subject progress are real as of P4 — those come from
 * `lib/useSubjects` and are not mocked here any more. What remains below is everything
 * whose phase has not landed: XP and streaks (P15). Tasks became real in P11 and the
 * daily quest in P12; their mocks were deleted with them.
 *
 * Each export is removed the moment its phase ships, so a stale mock cannot masquerade
 * as a feature that works.
 */
import { levelProgress, levelTitle, XP } from "@sq/core/gamification";

export const TOTAL_XP = 1_240;

export const profile = {
  totalXp: TOTAL_XP,
  streakDays: 7,
};

export const level = {
  ...levelProgress(profile.totalXp),
  title: levelTitle(levelProgress(profile.totalXp).level),
  next: XP.quizAttempt * 5,
};

export const recommendation = {
  text: "You scored 5/10 on Motion. Try a quick review?",
  cta: "Start review",
};

/**
 * Gamification state (P15): TanStack Query over /api/gamification.
 *
 * One key family, because three screens read the same row and must never
 * disagree: Home's level strip, Progress's achievements, and the level watcher
 * in the shell. Every mutation that can move XP or a streak day invalidates
 * `gamificationKeys.all`, so the next read is the truth — the server re-evaluates
 * achievements on each read, no client cache ever computes progress of its own.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { gamificationApi, type ClaimResult } from "./gamificationApi";

export type { AchievementView, GamificationView, StreakView } from "./gamificationApi";

export const gamificationKeys = {
  all: ["gamification"] as const,
  view: ["gamification", "view"] as const,
};

/** The shared view: level, XP, streak, calendar days, achievements. */
export function useGamification() {
  return useQuery({
    queryKey: gamificationKeys.view,
    queryFn: () => gamificationApi.view(),
  });
}

/**
 * Claim an unlocked achievement. The XP lands server-side in one ledger row
 * keyed by the achievement's code, so a double-press answers with the same
 * reward. The view invalidates *settled* — success or failure — so a claim the
 * server refused (already paid, not yet unlocked) heals by re-reading rather
 * than leaving a button that can never work.
 */
export function useClaimAchievement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string): Promise<ClaimResult> => gamificationApi.claim(code),
    onSettled: () => queryClient.invalidateQueries({ queryKey: gamificationKeys.all }),
  });
}

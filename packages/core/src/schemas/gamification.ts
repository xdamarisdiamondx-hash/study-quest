/**
 * Gamification contracts (P15): the only write the screens make — claiming an
 * unlocked achievement. Reading the view needs no body (it is the caller's
 * own), so this file stays deliberately small.
 */
import { z } from "zod";

export const claimAchievementSchema = z.object({
  code: z.string().min(1).max(64),
});

export type ClaimAchievement = z.infer<typeof claimAchievementSchema>;

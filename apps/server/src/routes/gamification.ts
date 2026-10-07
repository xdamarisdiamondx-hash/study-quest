/**
 * Gamification API (P15, PRD §22–24): the shared view, and the claim press.
 *
 * The view is one read — level and XP summed from the ledger, the streak, the
 * calendar days the streak counted, and all ten achievements with their
 * persisted progress — evaluated on GET so progress exists before the unlock
 * and the claim button only ever appears for something already earned.
 * Claiming is idempotent through the ledger: the same source row answers every
 * press, so a double-click cannot double-pay (ADR-015).
 */
import { Hono } from "hono";

import { claimAchievementSchema } from "@sq/core/schemas/gamification";

import { requireProfile, type ProfileEnv } from "../auth/currentProfile.ts";
import { claimAchievement } from "../services/achievements.ts";
import { gamificationView } from "../services/gamification.ts";

export const gamificationRouter = new Hono<ProfileEnv>();

gamificationRouter.use("*", async (c, next) => {
  const denied = await requireProfile(c);
  if (denied) return denied;
  await next();
});

gamificationRouter.get("/", async (c) => {
  return c.json(await gamificationView(c.get("profileId")));
});

gamificationRouter.post("/claim", async (c) => {
  const parsed = claimAchievementSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ error: "invalid", issues: parsed.error.issues.map((i) => i.message) }, 400);

  const xp = await claimAchievement(c.get("profileId"), parsed.data.code);
  if (xp === null) return c.json({ error: "not_unlocked" }, 409);
  return c.json({ code: parsed.data.code, xp, claimed: true });
});

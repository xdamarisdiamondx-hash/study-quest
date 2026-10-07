/**
 * Progress API (P16, PRD §24–25): one read that answers the Progress page and
 * the subject trend line alike.
 *
 * Everything is computed on read from the rows that caused it — session log,
 * attempts, quest steps — so no number here can outlive its evidence
 * (ADR-016). Day keys are the streak's own UTC days; weeks start Monday.
 */
import { Hono } from "hono";

import { requireProfile, type ProfileEnv } from "../auth/currentProfile.ts";
import { progressView } from "../services/progress.ts";

export const progressRouter = new Hono<ProfileEnv>();

progressRouter.use("*", async (c, next) => {
  const denied = await requireProfile(c);
  if (denied) return denied;
  await next();
});

progressRouter.get("/", async (c) => {
  return c.json(await progressView(c.get("profileId")));
});

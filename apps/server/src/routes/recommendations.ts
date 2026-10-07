/**
 * Recommendations (P17): GET serves the ranked, dismissal-filtered list for a
 * surface (`?context=home|after`); POST records a "Not today" for the plan day.
 * The router is read-mostly — the only write is one idempotent row.
 */
import { Hono } from "hono";

import { localDate, RECOMMENDATION_CODES, type RecommendContext } from "@sq/core/planning";
import { recommendationDismissals } from "@sq/db/schema";

import { requireProfile, type ProfileEnv } from "../auth/currentProfile.ts";
import { db } from "../db.ts";
import { recommendationsView } from "../services/recommendations.ts";

export const recommendationsRouter = new Hono<ProfileEnv>();

recommendationsRouter.use("*", async (c, next) => {
  const denied = await requireProfile(c);
  if (denied) return denied;
  await next();
});

recommendationsRouter.get("/", async (c) => {
  const context: RecommendContext = c.req.query("context") === "after" ? "after" : "home";
  return c.json(await recommendationsView(c.var.profileId, context));
});

recommendationsRouter.post("/dismiss", async (c) => {
  const body = await c.req.json<{ code?: unknown }>().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  if (!(RECOMMENDATION_CODES as readonly string[]).includes(code)) {
    return Response.json(
      { error: "invalid", issues: ["Unknown recommendation code."] },
      { status: 400 },
    );
  }
  await db.orm
    .insert(recommendationDismissals)
    .values({ userId: c.var.profileId, code, day: localDate(new Date()) })
    .onConflictDoNothing();
  return c.json({ ok: true });
});

/**
 * Study sessions (P14, PRD §26): start one of three modes, run it, finish it.
 *
 * The router owns persistence and ownership; every *decision* — how the clock
 * reads, what minutes a finish logs, which stages a guided run contains, what
 * the summary suggests — lives in the pure `@sq/core/sessions` engine, so the
 * rules test without a database (ADR-021). Ending is the only write that pays
 * anything: XP, the streak and the weekly quest's counter all move there.
 */
import { Hono } from "hono";

import {
  createSessionSchema,
  endSessionSchema,
  sessionStepSchema,
} from "@sq/core/schemas/sessions";

import { requireProfile, type ProfileEnv } from "../auth/currentProfile.ts";
import { endSession, listSessions, setSessionStep, startSession } from "../services/sessions.ts";

export const sessionsRouter = new Hono<ProfileEnv>();

sessionsRouter.use("*", async (c, next) => {
  const denied = await requireProfile(c);
  if (denied) return denied;
  await next();
});

function badRequest(issues: { message: string }[]) {
  return Response.json({ error: "invalid", issues: issues.map((i) => i.message) }, { status: 400 });
}

function notFound() {
  return Response.json({ error: "not_found" }, { status: 404 });
}

/* --- reads ----------------------------------------------------------------- */

/** The running session (for a reload) plus the recent log behind it. */
sessionsRouter.get("/", async (c) => {
  const lists = await listSessions(c.get("profileId"));
  return c.json(lists);
});

/* --- lifecycle -------------------------------------------------------------- */

sessionsRouter.post("/", async (c) => {
  const profileId = c.get("profileId");
  const parsed = createSessionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error.issues);

  const result = await startSession(profileId, parsed.data);
  if (!result) return notFound();
  if ("alreadyActive" in result) {
    return Response.json(
      { error: "already_active", session: result.alreadyActive },
      { status: 409 },
    );
  }
  return c.json({ session: result.session }, 201);
});

/**
 * Finish: log wall-time-minus-pause, award XP (idempotent), move the streak,
 * count the weekly quest — and answer with the whole summary card.
 */
sessionsRouter.post("/:id/end", async (c) => {
  const profileId = c.get("profileId");
  const parsed = endSessionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error.issues);

  const summary = await endSession(profileId, c.req.param("id"), parsed.data.pausedMin);
  if (!summary) return notFound();
  return c.json(summary);
});

/* --- guided stages ---------------------------------------------------------- */

sessionsRouter.patch("/:id/steps/:stepId", async (c) => {
  const profileId = c.get("profileId");
  const parsed = sessionStepSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error.issues);

  const view = await setSessionStep(
    profileId,
    c.req.param("id"),
    c.req.param("stepId"),
    parsed.data.status,
  );
  if (!view) return notFound();
  return c.json({ session: view });
});

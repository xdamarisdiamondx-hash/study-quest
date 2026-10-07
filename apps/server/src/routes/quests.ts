/**
 * Quests (P13, PRD §20–21): the list the Quests page renders, creation from
 * templates, step actions, and the one signal endpoint the client is allowed to
 * call ("the student looked at this") — objective successes (quizzes, cards)
 * are hooked server-side in their own routers, never trusted from the wire.
 *
 * The router owns persistence and ownership; every *decision* — which step a
 * signal completes, what a template's steps are, who gets offered what — lives
 * in the pure `@sq/core/quests` engine, so the rules test without a database
 * (ADR-021).
 */
import { Hono } from "hono";

import { createQuestSchema, declineOfferSchema, questSignalSchema } from "@sq/core/schemas/quests";

import { requireProfile, type ProfileEnv } from "../auth/currentProfile.ts";
import {
  abandonQuest,
  completeStep,
  createQuest,
  declineOffer,
  listQuests,
  questOffer,
  recordQuestSignal,
  resetStep,
} from "../services/quests.ts";
import { ownsTopic } from "../services/planning.ts";

export const questsRouter = new Hono<ProfileEnv>();

questsRouter.use("*", async (c, next) => {
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

/** Active + completed quests and the one suggested quest, if any. */
questsRouter.get("/", async (c) => {
  const profileId = c.get("profileId");
  const [lists, offer] = await Promise.all([listQuests(profileId), questOffer(profileId)]);
  return c.json({ ...lists, offer });
});

/* --- creation -------------------------------------------------------------- */

questsRouter.post("/", async (c) => {
  const profileId = c.get("profileId");
  const parsed = createQuestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error.issues);

  const view = await createQuest(profileId, parsed.data);
  // A scope that is not the caller's (or a template needing steps it has none
  // of) reads as not_found — the same answer as a missing row.
  if (!view) return notFound();
  return c.json({ quest: view }, 201);
});

/** Decline the suggested quest: the declined row is what silences re-offers. */
questsRouter.post("/offers/decline", async (c) => {
  const profileId = c.get("profileId");
  const parsed = declineOfferSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error.issues);
  await declineOffer(profileId, parsed.data);
  return c.json({ ok: true });
});

/* --- step actions ---------------------------------------------------------- */

questsRouter.post("/steps/:id/complete", async (c) => {
  const profileId = c.get("profileId");
  const result = await completeStep(profileId, c.req.param("id"));
  if (!result) return notFound();
  return c.json(result);
});

questsRouter.post("/steps/:id/reset", async (c) => {
  const profileId = c.get("profileId");
  const result = await resetStep(profileId, c.req.param("id"));
  if (!result) return notFound();
  return c.json(result);
});

/* --- signals --------------------------------------------------------------- */

/**
 * The client-driven half of the signal system: "the student opened these notes"
 * / "a summary was produced for this topic" are things only the screen knows.
 * Quiz and flashcard successes arrive through `recordQuestSignal` inside their
 * own routers, where the score is trusted.
 */
questsRouter.post("/signals", async (c) => {
  const profileId = c.get("profileId");
  const parsed = questSignalSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error.issues);
  if (!(await ownsTopic(profileId, parsed.data.topicId))) return notFound();

  const outcome = await recordQuestSignal(profileId, {
    type: parsed.data.type,
    topicIds: [parsed.data.topicId],
    subjectIds: [],
  });
  return c.json({ outcome });
});

/* --- lifecycle ------------------------------------------------------------- */

/** Abandon an active quest (completed quests stay as history). */
questsRouter.delete("/:id", async (c) => {
  const profileId = c.get("profileId");
  const ok = await abandonQuest(profileId, c.req.param("id"));
  if (!ok) return notFound();
  return c.json({ ok: true });
});

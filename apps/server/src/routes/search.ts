/**
 * Search (P19): GET / serves ranked results (`?q=`, optional `?type=` and
 * `?subjectId=` filters); the recents pair keeps what the palette offered
 * before. Every read and write is scoped to the caller's profile.
 */
import { Hono } from "hono";

import { SEARCH_TYPES, type SearchType } from "@sq/core/search";

import { requireProfile, type ProfileEnv } from "../auth/currentProfile.ts";
import { recentClear, recentList, recentSave, searchView } from "../services/search.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const searchRouter = new Hono<ProfileEnv>();

searchRouter.use("*", async (c, next) => {
  const denied = await requireProfile(c);
  if (denied) return denied;
  await next();
});

searchRouter.get("/", async (c) => {
  const rawType = c.req.query("type");
  if (rawType && !(SEARCH_TYPES as readonly string[]).includes(rawType)) {
    return Response.json(
      { error: "invalid", issues: [`Unknown result type "${rawType}".`] },
      { status: 400 },
    );
  }
  const subjectId = c.req.query("subjectId") ?? null;
  if (subjectId && !UUID_RE.test(subjectId)) {
    return Response.json(
      { error: "invalid", issues: ["subjectId must be a UUID."] },
      { status: 400 },
    );
  }
  return c.json(
    await searchView(c.var.profileId, {
      q: c.req.query("q") ?? "",
      type: (rawType as SearchType | undefined) ?? null,
      subjectId,
    }),
  );
});

searchRouter.get("/recent", async (c) => c.json({ recents: await recentList(c.var.profileId) }));

searchRouter.post("/recent", async (c) => {
  const body = await c.req.json<{ q?: unknown }>().catch(() => null);
  if (typeof body?.q !== "string") {
    return Response.json({ error: "invalid", issues: ["q must be a string."] }, { status: 400 });
  }
  await recentSave(c.var.profileId, body.q);
  return c.json({ ok: true });
});

searchRouter.delete("/recent", async (c) => {
  await recentClear(c.var.profileId);
  return c.json({ ok: true });
});

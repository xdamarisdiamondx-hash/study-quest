import { asc, count, eq } from "drizzle-orm";
import { Hono } from "hono";

import { STARTER_SUBJECTS, monogramFor } from "@sq/core/starter";
import * as dbSchema from "@sq/db/schema";

import type { AuthedEnv } from "../auth/session.ts";
import { getSession } from "../auth/session.ts";
import { db } from "../db.ts";
import { createQuest } from "../services/quests.ts";

const { users, subjects, topics, streaks, quests } = dbSchema;

export const onboarding = new Hono<AuthedEnv>();

async function profileFor(authUserId: string) {
  const [profile] = await db.orm
    .select()
    .from(users)
    .where(eq(users.authUserId, authUserId))
    .limit(1);
  return profile ?? null;
}

/** Templates offered by the picker: domain data, never a database read. */
onboarding.get("/templates", (c) =>
  c.json({
    subjects: STARTER_SUBJECTS.map((s) => ({
      name: s.name,
      monogram: monogramFor(s.name),
      topicCount: s.topics.length,
    })),
  }),
);

/** Has this account finished onboarding? */
onboarding.get("/state", async (c) => {
  const session = await getSession(c.req.raw.headers, c.get("auth"));
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const profile = await profileFor(session.user.id);
  if (!profile) return c.json({ error: "no_profile" }, 409);

  const settings = (profile.settings ?? {}) as { onboardedAt?: string };
  // Scoped to this user: a global count would leak how much other accounts have.
  const counted = await db.orm
    .select({ value: count() })
    .from(subjects)
    .where(eq(subjects.userId, profile.id));

  return c.json({
    onboardedAt: settings.onboardedAt ?? null,
    needsOnboarding: !settings.onboardedAt,
    subjectCount: counted[0]?.value ?? 0,
  });
});

/** Copy a starter subject set into this user's own subjects and topics. */
onboarding.post("/subjects", async (c) => {
  const session = await getSession(c.req.raw.headers, c.get("auth"));
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const profile = await profileFor(session.user.id);
  if (!profile) return c.json({ error: "no_profile" }, 409);

  const body = (await c.req.json().catch(() => ({}))) as { subjects?: string[] };
  const wanted = new Set(body.subjects ?? []);
  const chosen = STARTER_SUBJECTS.filter((s) => wanted.has(s.name));

  if (chosen.length === 0) return c.json({ error: "no_subjects_selected" }, 400);

  // Replace rather than merge, so re-running onboarding cannot duplicate subjects.
  await db.orm.delete(subjects).where(eq(subjects.userId, profile.id));
  // Quests pointed at those subjects — replace them too, for the same reason
  // (P13: a starter quest is part of what this endpoint hands out).
  await db.orm.delete(quests).where(eq(quests.userId, profile.id));

  const created = await db.orm
    .insert(subjects)
    .values(
      chosen.map((s, index) => ({
        userId: profile.id,
        name: s.name,
        // The template carries its own approved monogram; monogramFor is only the
        // fallback for subjects the student creates themselves.
        monogram: s.monogram,
        orderIndex: index,
      })),
    )
    .returning({ id: subjects.id, name: subjects.name });

  const topicRows = created.flatMap((row, index) =>
    (chosen[index]?.topics ?? []).map((t, order) => ({
      subjectId: row.id,
      name: t.name,
      description: t.description,
      orderIndex: order,
    })),
  );
  if (topicRows.length > 0) await db.orm.insert(topics).values(topicRows);

  // The first-run experience has a quest waiting (P13): the canonical
  // "Master {topic}" over the first topic of the first chosen subject —
  // steps deep-link into whichever activities the student builds first.
  const first = created[0];
  if (first) {
    const [firstTopic] = await db.orm
      .select({ id: topics.id })
      .from(topics)
      .where(eq(topics.subjectId, first.id))
      .orderBy(asc(topics.orderIndex))
      .limit(1);
    if (firstTopic) await createQuest(profile.id, { template: "topic", topicId: firstTopic.id });
  }

  return c.json({ subjects: created, topicCount: topicRows.length }, 201);
});

/** Close onboarding: record the moment and open a fresh streak. */
onboarding.post("/complete", async (c) => {
  const session = await getSession(c.req.raw.headers, c.get("auth"));
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const profile = await profileFor(session.user.id);
  if (!profile) return c.json({ error: "no_profile" }, 409);

  const settings = (profile.settings ?? {}) as Record<string, unknown>;
  await db.orm
    .update(users)
    .set({ settings: { ...settings, onboardedAt: new Date().toISOString() } })
    .where(eq(users.id, profile.id));

  await db.orm.insert(streaks).values({ userId: profile.id }).onConflictDoNothing();

  return c.json({ ok: true });
});

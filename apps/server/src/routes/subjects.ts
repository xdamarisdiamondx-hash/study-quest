import { Hono } from "hono";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { subjectProgress, topicProgress } from "@sq/core/progress";
import { applyReorder, monogramFor, resequence } from "@sq/core/subjects";
import {
  TOPIC_STATUS_LABEL,
  createSubjectSchema,
  createTopicSchema,
  importTemplatesSchema,
  reorderSchema,
  updateSubjectSchema,
  updateTopicSchema,
  type Topic,
  type TopicStatus,
} from "@sq/core/schemas/subjects";
import { STARTER_SUBJECTS } from "@sq/core/starter";
import { subjects, topics } from "@sq/db/schema";

import { requireProfile, type ProfileEnv } from "../auth/currentProfile.ts";
import { db } from "../db.ts";
import {
  completedSubjectQuests,
  questCompletionByTopic,
  reviewCoverageByTopic,
} from "../services/progress.ts";
import { sessionMinutesByTopic } from "../services/sessions.ts";

/**
 * Subjects and topics (P4, PRD section 6).
 *
 * Every query is scoped by the `profileId` that `requireProfile` puts on the context, so
 * there is no route here that can read another account's data.
 */
export const subjectsRouter = new Hono<ProfileEnv>();

subjectsRouter.use("*", async (c, next) => {
  const denied = await requireProfile(c);
  if (denied) return denied;
  await next();
});

/* --- serialisation ------------------------------------------------------- */

/**
 * Dates go out as ISO strings so the payload matches `subjectSchema` and the web client can
 * parse them without special-casing Date objects.
 */
function serialiseSubject(row: typeof subjects.$inferSelect) {
  return {
    ...row,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    archived: row.archivedAt !== null,
  };
}

function serialiseTopic(row: typeof topics.$inferSelect) {
  return {
    ...row,
    lastStudiedAt: row.lastStudiedAt ? row.lastStudiedAt.toISOString() : null,
    statusLabel: TOPIC_STATUS_LABEL[row.status as TopicStatus],
  };
}

/* --- helpers ------------------------------------------------------------- */

/**
 * Map a topic row onto the inputs the shared progress formula expects (section 18.3).
 *
 * All four inputs are real as of P16: mastery from the cached attempt weight,
 * review coverage from the topic's reviewed cards, session minutes from the
 * study_sessions log (P14) and quest completion from the topic's own quest
 * steps — the zeros and status stand-ins this function used to carry were the
 * placeholders P15's note promised P16 would replace.
 */
function topicProgressInput(
  topic: Topic,
  minutes: number,
  reviewCoverage: number,
  questCompletion: number,
) {
  return {
    mastery: topic.progressCache,
    reviewCoverage,
    sessionMinutes: minutes,
    questCompletion,
  };
}

function badRequest(issues: { message: string }[]) {
  return Response.json({ error: "invalid", issues: issues.map((i) => i.message) }, { status: 400 });
}

function notFound() {
  return Response.json({ error: "not_found" }, { status: 404 });
}

/** Highest orderIndex in use, so a new row appends instead of colliding. */
async function lastSubjectOrder(profileId: string): Promise<number> {
  const rows = await db.orm
    .select({ max: sql<number>`coalesce(max(${subjects.orderIndex}), -1)` })
    .from(subjects)
    .where(eq(subjects.userId, profileId));
  return Number(rows[0]?.max ?? -1);
}

async function lastTopicOrder(subjectId: string): Promise<number> {
  const rows = await db.orm
    .select({ max: sql<number>`coalesce(max(${topics.orderIndex}), -1)` })
    .from(topics)
    .where(eq(topics.subjectId, subjectId));
  return Number(rows[0]?.max ?? -1);
}

/** Does this subject belong to the caller? Guards every topic route. */
async function ownsSubject(profileId: string, subjectId: string): Promise<boolean> {
  const [row] = await db.orm
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.id, subjectId), eq(subjects.userId, profileId)))
    .limit(1);
  return row !== undefined;
}

/** Fetch a topic only if its subject belongs to the caller. */
async function ownedTopic(profileId: string, topicId: string) {
  const [topic] = await db.orm.select().from(topics).where(eq(topics.id, topicId)).limit(1);
  if (!topic) return null;
  if (!(await ownsSubject(profileId, topic.subjectId))) return null;
  return topic;
}

/** Rewrite orderIndex to a dense 0..n-1 sequence, closing gaps left by a delete. */
async function resequenceSubjects(profileId: string) {
  const current = await db.orm
    .select({ id: subjects.id, orderIndex: subjects.orderIndex })
    .from(subjects)
    .where(eq(subjects.userId, profileId));
  for (const [id, orderIndex] of resequence(current)) {
    await db.orm.update(subjects).set({ orderIndex }).where(eq(subjects.id, id));
  }
}

async function resequenceTopics(subjectId: string) {
  const current = await db.orm
    .select({ id: topics.id, orderIndex: topics.orderIndex })
    .from(topics)
    .where(eq(topics.subjectId, subjectId));
  for (const [id, orderIndex] of resequence(current)) {
    await db.orm.update(topics).set({ orderIndex }).where(eq(topics.id, id));
  }
}

/** Every subject for this account, with topic count and progress. */
async function subjectSummaries(profileId: string) {
  const rows = await db.orm
    .select()
    .from(subjects)
    .where(eq(subjects.userId, profileId))
    .orderBy(asc(subjects.orderIndex));
  if (rows.length === 0) return [];

  const all = await db.orm
    .select()
    .from(topics)
    .where(
      inArray(
        topics.subjectId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(topics.orderIndex));

  const bySubject = new Map<string, Topic[]>();
  for (const t of all) {
    const list = bySubject.get(t.subjectId) ?? [];
    list.push(t as unknown as Topic);
    bySubject.set(t.subjectId, list);
  }

  const topicIds = all.map((t) => t.id);
  const [minutes, review, questShare, subjectQuests] = await Promise.all([
    sessionMinutesByTopic(profileId, topicIds),
    reviewCoverageByTopic(profileId, topicIds),
    questCompletionByTopic(profileId, topicIds),
    completedSubjectQuests(
      profileId,
      rows.map((r) => r.id),
    ),
  ]);

  return rows.map((row) => {
    const own = bySubject.get(row.id) ?? [];
    return {
      ...serialiseSubject(row),
      topicCount: own.length,
      progress: subjectProgress(
        own.map((t) =>
          topicProgressInput(
            t,
            minutes.get(t.id) ?? 0,
            review.get(t.id) ?? 0,
            questShare.get(t.id) ?? 0,
          ),
        ),
        subjectQuests.get(row.id) ?? 0,
      ),
    };
  });
}

/* --- subjects ------------------------------------------------------------ */

/** GET /api/subjects */
subjectsRouter.get("/", async (c) => {
  return Response.json({ subjects: await subjectSummaries(c.get("profileId")) });
});

/** POST /api/subjects — the monogram is derived from the name, never chosen. */
subjectsRouter.post("/", async (c) => {
  const profileId = c.get("profileId");
  const parsed = createSubjectSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error.issues);

  const [created] = await db.orm
    .insert(subjects)
    .values({
      userId: profileId,
      name: parsed.data.name.trim(),
      monogram: parsed.data.monogram ?? monogramFor(parsed.data.name),
      icon: parsed.data.icon ?? null,
      orderIndex: (await lastSubjectOrder(profileId)) + 1,
    })
    .returning();
  if (!created) return Response.json({ error: "insert_failed" }, { status: 500 });

  return Response.json({ subject: serialiseSubject(created) }, { status: 201 });
});

/** POST /api/subjects/reorder — drag or keyboard reordering. */
subjectsRouter.post("/reorder", async (c) => {
  const profileId = c.get("profileId");
  const parsed = reorderSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error.issues);

  const current = await db.orm
    .select({ id: subjects.id, orderIndex: subjects.orderIndex })
    .from(subjects)
    .where(eq(subjects.userId, profileId));

  for (const [id, orderIndex] of applyReorder(current, parsed.data.ids)) {
    await db.orm
      .update(subjects)
      .set({ orderIndex })
      .where(and(eq(subjects.id, id), eq(subjects.userId, profileId)));
  }

  return Response.json({ subjects: await subjectSummaries(profileId) });
});

/** POST /api/subjects/import — copy starter templates into this account (section 6). */
subjectsRouter.post("/import", async (c) => {
  const profileId = c.get("profileId");
  const parsed = importTemplatesSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error.issues);

  const wanted = new Set(parsed.data.subjects);
  const chosen = STARTER_SUBJECTS.filter((s) => wanted.has(s.name));
  if (chosen.length === 0) {
    return Response.json({ error: "no_matching_template" }, { status: 400 });
  }

  let order = await lastSubjectOrder(profileId);
  const created = await db.orm
    .insert(subjects)
    .values(
      chosen.map((s) => {
        order += 1;
        return { userId: profileId, name: s.name, monogram: s.monogram, orderIndex: order };
      }),
    )
    .returning({ id: subjects.id });

  const rows = created.flatMap((row, index) =>
    (chosen[index]?.topics ?? []).map((t, orderIndex) => ({
      subjectId: row.id,
      name: t.name,
      description: t.description,
      orderIndex,
    })),
  );
  if (rows.length > 0) await db.orm.insert(topics).values(rows);

  return Response.json({ imported: created.length }, { status: 201 });
});

/** GET /api/subjects/:id — one subject plus its topics and progress. */
subjectsRouter.get("/:id", async (c) => {
  const profileId = c.get("profileId");
  const id = c.req.param("id");

  const [subject] = await db.orm
    .select()
    .from(subjects)
    .where(and(eq(subjects.id, id), eq(subjects.userId, profileId)))
    .limit(1);
  if (!subject) return notFound();

  const own = await db.orm
    .select()
    .from(topics)
    .where(eq(topics.subjectId, id))
    .orderBy(asc(topics.orderIndex));

  const topicIds = own.map((t) => t.id);
  const [minutes, review, questShare, subjectQuests] = await Promise.all([
    sessionMinutesByTopic(profileId, topicIds),
    reviewCoverageByTopic(profileId, topicIds),
    questCompletionByTopic(profileId, topicIds),
    completedSubjectQuests(profileId, [id]),
  ]);
  const inputFor = (t: (typeof own)[number]) =>
    topicProgressInput(
      t as unknown as Topic,
      minutes.get(t.id) ?? 0,
      review.get(t.id) ?? 0,
      questShare.get(t.id) ?? 0,
    );

  return Response.json({
    subject: {
      ...serialiseSubject(subject),
      topicCount: own.length,
      progress: subjectProgress(own.map(inputFor), subjectQuests.get(id) ?? 0),
    },
    // PRD §25 wants each topic's percentage beside its status — measured on
    // read by the same formula the subject total averages.
    topics: own.map((t) => ({ ...serialiseTopic(t), progress: topicProgress(inputFor(t)) })),
  });
});

/** PATCH /api/subjects/:id — rename, change icon, archive or unarchive. */
subjectsRouter.patch("/:id", async (c) => {
  const profileId = c.get("profileId");
  const parsed = updateSubjectSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error.issues);

  const id = c.req.param("id");
  const changes: Partial<typeof subjects.$inferInsert> = {};

  if (parsed.data.name !== undefined) {
    changes.name = parsed.data.name.trim();
    // Keep the monogram in step with the name unless one was set deliberately.
    changes.monogram = monogramFor(parsed.data.name);
  }
  if (parsed.data.monogram !== undefined) changes.monogram = parsed.data.monogram;
  if (parsed.data.icon !== undefined) changes.icon = parsed.data.icon;
  if (parsed.data.archived !== undefined) {
    changes.archivedAt = parsed.data.archived ? new Date() : null;
  }

  const [updated] = await db.orm
    .update(subjects)
    .set(changes)
    .where(and(eq(subjects.id, id), eq(subjects.userId, profileId)))
    .returning();
  if (!updated) return notFound();

  return Response.json({ subject: serialiseSubject(updated) });
});

/** DELETE /api/subjects/:id — topics cascade via the foreign key (section 18.1). */
subjectsRouter.delete("/:id", async (c) => {
  const profileId = c.get("profileId");
  const id = c.req.param("id");

  const deleted = await db.orm
    .delete(subjects)
    .where(and(eq(subjects.id, id), eq(subjects.userId, profileId)))
    .returning({ id: subjects.id });
  if (deleted.length === 0) return notFound();

  await resequenceSubjects(profileId);
  return Response.json({ ok: true });
});

/* --- topics -------------------------------------------------------------- */

/** POST /api/subjects/:id/topics */
subjectsRouter.post("/:id/topics", async (c) => {
  const profileId = c.get("profileId");
  const subjectId = c.req.param("id");
  if (!(await ownsSubject(profileId, subjectId))) return notFound();

  const parsed = createTopicSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error.issues);

  const [created] = await db.orm
    .insert(topics)
    .values({
      subjectId,
      name: parsed.data.name.trim(),
      description: parsed.data.description ?? null,
      status: parsed.data.status ?? "not_started",
      orderIndex: (await lastTopicOrder(subjectId)) + 1,
    })
    .returning();
  if (!created) return Response.json({ error: "insert_failed" }, { status: 500 });

  return Response.json({ topic: serialiseTopic(created) }, { status: 201 });
});

/** POST /api/subjects/:id/topics/reorder */
subjectsRouter.post("/:id/topics/reorder", async (c) => {
  const profileId = c.get("profileId");
  const subjectId = c.req.param("id");
  if (!(await ownsSubject(profileId, subjectId))) return notFound();

  const parsed = reorderSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error.issues);

  const current = await db.orm
    .select({ id: topics.id, orderIndex: topics.orderIndex })
    .from(topics)
    .where(eq(topics.subjectId, subjectId));

  const next = applyReorder(current, parsed.data.ids);
  for (const [id, orderIndex] of next) {
    await db.orm.update(topics).set({ orderIndex }).where(eq(topics.id, id));
  }

  return Response.json({ ok: true, order: Object.fromEntries(next) });
});

/** PATCH /api/subjects/topics/:topicId */
subjectsRouter.patch("/topics/:topicId", async (c) => {
  const profileId = c.get("profileId");
  const topicId = c.req.param("topicId");
  if (!(await ownedTopic(profileId, topicId))) return notFound();

  const parsed = updateTopicSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error.issues);

  const changes: Partial<typeof topics.$inferInsert> = {};
  if (parsed.data.name !== undefined) changes.name = parsed.data.name.trim();
  if (parsed.data.description !== undefined) changes.description = parsed.data.description;
  if (parsed.data.status !== undefined) {
    changes.status = parsed.data.status;
    // "Mastered" is something a student can declare; lastStudiedAt comes from real study.
    changes.progressCache = parsed.data.status === "mastered" ? 1 : 0;
  }

  const [updated] = await db.orm
    .update(topics)
    .set(changes)
    .where(eq(topics.id, topicId))
    .returning();
  if (!updated) return notFound();

  return Response.json({ topic: serialiseTopic(updated) });
});

/** DELETE /api/subjects/topics/:topicId */
subjectsRouter.delete("/topics/:topicId", async (c) => {
  const profileId = c.get("profileId");
  const topicId = c.req.param("topicId");

  const topic = await ownedTopic(profileId, topicId);
  if (!topic) return notFound();

  await db.orm.delete(topics).where(eq(topics.id, topicId));
  await resequenceTopics(topic.subjectId);
  return Response.json({ ok: true });
});

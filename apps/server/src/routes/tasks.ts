/**
 * Tasks, views and recurring series (P11, PRD sections 15–16, ADR-017).
 *
 * Every query is scoped by the `profileId` that `requireProfile` puts on the context.
 * Completion flows through the one XP/streak writer in `services/xp.ts`, so awards are
 * idempotent and undo revokes exactly what completion granted.
 *
 * Series semantics, in one place:
 * - The rule row owns the anchor date; each materialised row carries `recurrence_id`.
 * - Skipping an occurrence marks it `skipped` — it leaves Today/Upcoming/All, shows in
 *   Done with its chip, and undoes back to open. The series is untouched.
 * - Deleting an occurrence removes just that row; deleting the *head* re-points the
 *   series at another row first, because the head FK would otherwise cascade the whole
 *   series away. `?series=true` deletes the rule row, which cascades on purpose.
 */
import { Hono } from "hono";
import { and, asc, desc, eq, gte, inArray, ne } from "drizzle-orm";

import { XP } from "@sq/core/gamification";
import {
  createTaskSchema,
  type Recurrence,
  type RecurrenceInput,
  type Task,
  updateTaskSchema,
} from "@sq/core/schemas/tasks";
import { nextOccurrence, startOfDay, type RecurrenceRule } from "@sq/core/tasks";
import { subjects, taskRecurrences, tasks, topics } from "@sq/db/schema";

import { requireProfile, type ProfileEnv } from "../auth/currentProfile.ts";
import { db } from "../db.ts";
import { materialiseOccurrences } from "../services/taskRecurrence.ts";
import { awardXp, recordActivity, revokeXp } from "../services/xp.ts";

export const tasksRouter = new Hono<ProfileEnv>();

tasksRouter.use("*", async (c, next) => {
  const denied = await requireProfile(c);
  if (denied) return denied;
  await next();
});

/* --- helpers -------------------------------------------------------------- */

function badRequest(issues: { message: string }[]) {
  return Response.json({ error: "invalid", issues: issues.map((i) => i.message) }, { status: 400 });
}

function notFound() {
  return Response.json({ error: "not_found" }, { status: 404 });
}

function toRule(rec: typeof taskRecurrences.$inferSelect): Recurrence {
  return {
    freq: rec.freq as Recurrence["freq"],
    interval: rec.interval,
    byWeekday: rec.byWeekday,
    untilAt: rec.untilAt ? rec.untilAt.toISOString() : null,
  };
}

function normaliseRule(input: RecurrenceInput): RecurrenceRule {
  return {
    freq: input.freq,
    interval: input.interval ?? 1,
    byWeekday: input.byWeekday ?? "",
    untilAt: input.untilAt ?? null,
  };
}

function serialise(row: typeof tasks.$inferSelect, rule: Recurrence | null): Task {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    subjectId: row.subjectId,
    topicId: row.topicId,
    kind: row.kind as Task["kind"],
    priority: row.priority as Task["priority"],
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    estimateMin: row.estimateMin,
    notes: row.notes,
    status: row.status as Task["status"],
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    recurrenceId: row.recurrenceId,
    rule,
  };
}

/** Serialise one row, fetching its rule if it belongs to a series. */
async function serialiseOne(row: typeof tasks.$inferSelect | undefined): Promise<Task | null> {
  if (!row) return null;
  if (!row.recurrenceId) return serialise(row, null);
  const [rec] = await db.orm
    .select()
    .from(taskRecurrences)
    .where(eq(taskRecurrences.id, row.recurrenceId))
    .limit(1);
  return serialise(row, rec ? toRule(rec) : null);
}

async function rulesFor(rows: (typeof tasks.$inferSelect)[]): Promise<Map<string, Recurrence>> {
  const ids = [...new Set(rows.flatMap((r) => (r.recurrenceId ? [r.recurrenceId] : [])))];
  if (ids.length === 0) return new Map();
  const recs = await db.orm.select().from(taskRecurrences).where(inArray(taskRecurrences.id, ids));
  return new Map(recs.map((r) => [r.id, toRule(r)]));
}

async function getTask(
  profileId: string,
  id: string,
): Promise<typeof tasks.$inferSelect | undefined> {
  const [row] = await db.orm
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, profileId)))
    .limit(1);
  return row;
}

/** Does this subject belong to the caller? */
async function ownsSubject(profileId: string, subjectId: string): Promise<boolean> {
  const [row] = await db.orm
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.id, subjectId), eq(subjects.userId, profileId)))
    .limit(1);
  return row !== undefined;
}

/** Does this topic belong to the caller? Checked through its subject's owner. */
async function ownsTopic(profileId: string, topicId: string): Promise<boolean> {
  const [row] = await db.orm
    .select({ id: topics.id })
    .from(topics)
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .where(and(eq(topics.id, topicId), eq(subjects.userId, profileId)))
    .limit(1);
  return row !== undefined;
}

async function validatePlacement(
  profileId: string,
  input: { subjectId?: string | null; topicId?: string | null },
): Promise<boolean> {
  if (input.subjectId && !(await ownsSubject(profileId, input.subjectId))) return false;
  if (input.topicId && !(await ownsTopic(profileId, input.topicId))) return false;
  return true;
}

const xpSource = (userId: string, taskId: string) => ({
  userId,
  reason: "task_complete",
  sourceType: "task",
  sourceId: taskId,
});

/* --- reads ---------------------------------------------------------------- */

/**
 * GET /api/tasks?subjectId=... — every task in the account, sorted by due date.
 *
 * Materialisation runs first: it is what makes recurring rows appear on the right days
 * with no scheduler process to babysit (ADR-017), and it is idempotent by construction.
 * Views, filters and sorting are client concerns over this list.
 */
tasksRouter.get("/", async (c) => {
  const profileId = c.get("profileId");
  const subjectId = c.req.query("subjectId") ?? null;

  await materialiseOccurrences(profileId);

  const rows = await db.orm
    .select()
    .from(tasks)
    .where(
      subjectId
        ? and(eq(tasks.userId, profileId), eq(tasks.subjectId, subjectId))
        : eq(tasks.userId, profileId),
    )
    .orderBy(asc(tasks.dueAt), desc(tasks.createdAt));

  const rules = await rulesFor(rows);
  return Response.json({
    tasks: rows.map((row) =>
      serialise(row, row.recurrenceId ? (rules.get(row.recurrenceId) ?? null) : null),
    ),
  });
});

/* --- writes --------------------------------------------------------------- */

/** POST /api/tasks — create one task; with `recurrence`, its series head. */
tasksRouter.post("/", async (c) => {
  const profileId = c.get("profileId");
  const body = await c.req.json().catch(() => null);
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const input = parsed.data;
  if (!(await validatePlacement(profileId, input))) return notFound();

  const [head] = await db.orm
    .insert(tasks)
    .values({
      userId: profileId,
      title: input.title,
      subjectId: input.subjectId ?? null,
      topicId: input.topicId ?? null,
      kind: input.kind ?? "assignment",
      priority: input.priority ?? "normal",
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      estimateMin: input.estimateMin ?? 0,
      notes: input.notes ?? null,
    })
    .returning();
  if (!head) return Response.json({ error: "internal_error" }, { status: 500 });

  if (!input.recurrence) {
    return Response.json({ task: await serialiseOne(head) }, { status: 201 });
  }

  const rule = normaliseRule(input.recurrence);
  const anchor = head.dueAt ?? new Date();
  const [rec] = await db.orm
    .insert(taskRecurrences)
    .values({
      taskId: head.id,
      anchorAt: anchor,
      freq: rule.freq,
      interval: rule.interval,
      byWeekday: rule.byWeekday,
      untilAt: rule.untilAt ? new Date(rule.untilAt) : null,
      nextAt: nextOccurrence(anchor, rule, anchor),
    })
    .returning();
  if (!rec) return Response.json({ error: "internal_error" }, { status: 500 });

  await db.orm.update(tasks).set({ recurrenceId: rec.id }).where(eq(tasks.id, head.id));
  await materialiseOccurrences(profileId);

  return Response.json(
    { task: await serialiseOne({ ...head, recurrenceId: rec.id }) },
    { status: 201 },
  );
});

/** PATCH /api/tasks/:id — edit one occurrence, or the whole series with `?series=true`. */
tasksRouter.patch("/:id", async (c) => {
  const profileId = c.get("profileId");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const input = parsed.data;

  const task = await getTask(profileId, id);
  if (!task) return notFound();
  if (!(await validatePlacement(profileId, input))) return notFound();

  const isSeries = c.req.query("series") === "true" && task.recurrenceId !== null;
  const todayStart = startOfDay(new Date());

  const changes: Partial<typeof tasks.$inferInsert> = {};
  if (input.title !== undefined) changes.title = input.title;
  if (input.subjectId !== undefined) changes.subjectId = input.subjectId;
  if (input.topicId !== undefined) changes.topicId = input.topicId;
  if (input.kind !== undefined) changes.kind = input.kind;
  if (input.priority !== undefined) changes.priority = input.priority;
  if (input.estimateMin !== undefined) changes.estimateMin = input.estimateMin;
  if (input.notes !== undefined) changes.notes = input.notes;
  // The deadline belongs to a single day, even inside a series: the rule owns the days.
  if (input.dueAt !== undefined && !isSeries) {
    changes.dueAt = input.dueAt ? new Date(input.dueAt) : null;
  }

  if (!isSeries) {
    const [updated] = await db.orm
      .update(tasks)
      .set(changes)
      .where(and(eq(tasks.id, id), eq(tasks.userId, profileId)))
      .returning();
    return Response.json({ task: await serialiseOne(updated) });
  }

  /* --- series branch ------------------------------------------------------ */

  const recId = task.recurrenceId as string;
  const [rec] = await db.orm
    .select()
    .from(taskRecurrences)
    .where(eq(taskRecurrences.id, recId))
    .limit(1);
  if (!rec) return notFound();
  const headId = rec.taskId;

  // Field changes reach every row of the series, today's included.
  await db.orm.update(tasks).set(changes).where(eq(tasks.recurrenceId, recId));

  if (input.recurrence !== undefined && input.recurrence === null) {
    // "Does not repeat": generated future days go away; completed history and the first
    // row stay behind as ordinary one-off tasks.
    await db.orm
      .delete(tasks)
      .where(
        and(
          eq(tasks.recurrenceId, recId),
          eq(tasks.status, "open"),
          ne(tasks.id, headId),
          gte(tasks.dueAt, todayStart),
        ),
      );
    await db.orm.update(tasks).set({ recurrenceId: null }).where(eq(tasks.recurrenceId, recId));
    await db.orm.delete(taskRecurrences).where(eq(taskRecurrences.id, recId));
    const [fresh] = await db.orm.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return Response.json({ task: await serialiseOne(fresh) });
  }

  if (input.recurrence) {
    // A replaced rule rewrites the open window (today onward); missed days and completed
    // rows are history and stay exactly as they were.
    const rule = normaliseRule(input.recurrence);
    await db.orm
      .delete(tasks)
      .where(
        and(
          eq(tasks.recurrenceId, recId),
          eq(tasks.status, "open"),
          ne(tasks.id, headId),
          gte(tasks.dueAt, todayStart),
        ),
      );
    await db.orm
      .update(taskRecurrences)
      .set({
        freq: rule.freq,
        interval: rule.interval,
        byWeekday: rule.byWeekday,
        untilAt: rule.untilAt ? new Date(rule.untilAt) : null,
        nextAt: nextOccurrence(rec.anchorAt, rule, rec.anchorAt),
      })
      .where(eq(taskRecurrences.id, recId));
    await materialiseOccurrences(profileId);
  }

  const [fresh] = await db.orm.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return Response.json({ task: await serialiseOne(fresh) });
});

/**
 * DELETE /api/tasks/:id — remove one occurrence (a manual "delete this"), or the whole
 * series with `?series=true`. XP awarded for completed rows is revoked, so a delete
 * never leaves behind points for work that no longer exists.
 */
tasksRouter.delete("/:id", async (c) => {
  const profileId = c.get("profileId");
  const id = c.req.param("id");
  const series = c.req.query("series") === "true";

  const task = await getTask(profileId, id);
  if (!task) return notFound();

  if (series && task.recurrenceId) {
    const rows = await db.orm
      .select({ id: tasks.id, status: tasks.status })
      .from(tasks)
      .where(eq(tasks.recurrenceId, task.recurrenceId));
    for (const row of rows) {
      if (row.status === "done") await revokeXp(xpSource(profileId, row.id));
    }
    // Deleting the rule cascades every row that points at it — that *is* the series.
    await db.orm.delete(taskRecurrences).where(eq(taskRecurrences.id, task.recurrenceId));
    return Response.json({ ok: true, deleted: rows.length });
  }

  if (task.status === "done") await revokeXp(xpSource(profileId, task.id));

  if (task.recurrenceId) {
    const [rec] = await db.orm
      .select()
      .from(taskRecurrences)
      .where(eq(taskRecurrences.id, task.recurrenceId))
      .limit(1);
    if (rec && rec.taskId === task.id) {
      // Removing the head would cascade the series away with it — re-point the series at
      // its next occurrence first, so a series survives losing its first row.
      const [other] = await db.orm
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.recurrenceId, task.recurrenceId), ne(tasks.id, task.id)))
        .orderBy(asc(tasks.dueAt))
        .limit(1);
      if (other) {
        await db.orm
          .update(taskRecurrences)
          .set({ taskId: other.id })
          .where(eq(taskRecurrences.id, task.recurrenceId));
      }
    }
  }

  await db.orm.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, profileId)));
  return Response.json({ ok: true });
});

/* --- completion ----------------------------------------------------------- */

/**
 * POST /api/tasks/:id/complete — award XP (idempotent), count a streak day.
 *
 * Quest hooks arrive with P13; the streak hook lands here because it is the same
 * "real work happened" signal P15 will reuse across every feature.
 */
tasksRouter.post("/:id/complete", async (c) => {
  const profileId = c.get("profileId");
  const id = c.req.param("id");

  const task = await getTask(profileId, id);
  if (!task) return notFound();
  if (task.status === "done") {
    return Response.json({ task: await serialiseOne(task), xpAwarded: 0, streak: null });
  }

  const [updated] = await db.orm
    .update(tasks)
    .set({ status: "done", completedAt: new Date() })
    .where(and(eq(tasks.id, id), eq(tasks.userId, profileId)))
    .returning();

  const xpAwarded = await awardXp({
    delta: XP.task,
    ...xpSource(profileId, id),
  });
  const streak = await recordActivity(profileId);

  return Response.json({
    task: await serialiseOne(updated),
    xpAwarded,
    streak: streak.current,
  });
});

/**
 * POST /api/tasks/:id/uncomplete — undo: back to open, and the award goes back too.
 * Also un-skips, since a skipped row never held XP to revoke.
 */
tasksRouter.post("/:id/uncomplete", async (c) => {
  const profileId = c.get("profileId");
  const id = c.req.param("id");

  const task = await getTask(profileId, id);
  if (!task) return notFound();
  if (task.status === "open") {
    return Response.json({ task: await serialiseOne(task) });
  }

  const [updated] = await db.orm
    .update(tasks)
    .set({ status: "open", completedAt: null })
    .where(and(eq(tasks.id, id), eq(tasks.userId, profileId)))
    .returning();
  await revokeXp(xpSource(profileId, id));

  return Response.json({ task: await serialiseOne(updated) });
});

/**
 * POST /api/tasks/:id/skip — this occurrence doesn't happen today; the series does.
 * No XP moves (nothing was learned yet), and undo puts the row back on the list.
 */
tasksRouter.post("/:id/skip", async (c) => {
  const profileId = c.get("profileId");
  const id = c.req.param("id");

  const task = await getTask(profileId, id);
  if (!task) return notFound();
  if (task.status !== "open") {
    return Response.json({ task: await serialiseOne(task) });
  }

  const [updated] = await db.orm
    .update(tasks)
    .set({ status: "skipped" })
    .where(and(eq(tasks.id, id), eq(tasks.userId, profileId)))
    .returning();
  return Response.json({ task: await serialiseOne(updated) });
});

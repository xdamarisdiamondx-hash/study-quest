/**
 * The day plan (P12, PRD sections 17–19): one artifact serving both the Plan page and
 * the home screen's Today's Quest — the same rows, presented two ways (A.8).
 *
 * The router owns persistence and ownership; every *decision* about what a day should
 * contain lives in the pure `@sq/core/planning` engine, so the rules test without a
 * database and the two surfaces cannot disagree (ADR-021).
 *
 * Semantics worth writing down once:
 * - A day is keyed by local date; the plan row appears on first touch (ensure).
 * - Dismissing a candidate stores a dismissed row — it survives refresh, and a new
 *   day gets a new plan, so "not today" is genuinely today-only.
 * - Regenerating keeps done + dismissed rows and rebuilds the rest; done minutes
 *   count against capacity so a half-finished day doesn't get doubled up.
 * - Completing a task-kind block proxies through `services/taskActions` (the one XP
 *   writer); other kinds award no XP of their own but do count as a study day.
 */
import { Hono } from "hono";
import { and, asc, eq, inArray, ne } from "drizzle-orm";

import {
  blockTitle,
  dayCandidates,
  DEFAULT_CAPACITY_MIN,
  generateBlocks,
  localDate,
  planLoad,
  type BlockKind,
  type BlockSnapshot,
  type BlockStatus,
  type DayCandidate,
} from "@sq/core/planning";
import {
  addBlocksSchema,
  capacitySchema,
  createPlanSchema,
  dismissCandidateSchema,
  generatePlanSchema,
  planDateSchema,
  reorderPlanSchema,
  updateBlockSchema,
} from "@sq/core/schemas/plan";
import { planBlocks, plans, subjects, tasks, topics, users } from "@sq/db/schema";

import { requireProfile, type ProfileEnv } from "../auth/currentProfile.ts";
import { db } from "../db.ts";
import {
  ownsTask,
  ownsTopic,
  openTaskSnapshots,
  ownedTopicIds,
  subjectNames,
  topicSnapshots,
} from "../services/planning.ts";
import { completeTask, uncompleteTask } from "../services/taskActions.ts";
import { materialiseOccurrences } from "../services/taskRecurrence.ts";
import { recordActivity } from "../services/xp.ts";

export const planRouter = new Hono<ProfileEnv>();

planRouter.use("*", async (c, next) => {
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

/** First touch creates the day's plan; every read and write goes through this. */
async function ensurePlan(profileId: string, date: string) {
  const [existing] = await db.orm
    .select()
    .from(plans)
    .where(and(eq(plans.userId, profileId), eq(plans.date, date)))
    .limit(1);
  if (existing) return existing;
  const [created] = await db.orm.insert(plans).values({ userId: profileId, date }).returning();
  if (!created) throw new Error("could not create plan");
  return created;
}

/** Daily capacity lives in settings (global, not per-day) until the student changes it. */
async function capacityOf(profileId: string): Promise<number> {
  const [row] = await db.orm
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, profileId))
    .limit(1);
  const settings = (row?.settings ?? {}) as { planning?: { dailyMinutes?: number } };
  return settings.planning?.dailyMinutes ?? DEFAULT_CAPACITY_MIN;
}

/** The plan's own status follows its rows: content = ready, nothing = draft. */
async function touchStatus(planId: string): Promise<void> {
  const [row] = await db.orm
    .select({ id: planBlocks.id })
    .from(planBlocks)
    .where(and(eq(planBlocks.planId, planId), ne(planBlocks.status, "dismissed")))
    .limit(1);
  await db.orm
    .update(plans)
    .set({ status: row ? "ready" : "draft" })
    .where(eq(plans.id, planId));
}

interface ResolvedBlock {
  id: string;
  kind: BlockKind;
  refId: string | null;
  title: string;
  subjectId: string | null;
  subjectName: string | null;
  plannedMin: number;
  status: BlockStatus;
  completedAt: string | null;
  orderIndex: number;
}

/**
 * Turn storage rows into something the UI can draw: join tasks and topics for titles
 * and subject placement, and drop rows whose target no longer exists — a ghost block
 * should disappear, not render "Untitled".
 */
async function resolveBlocks(
  profileId: string,
  rows: (typeof planBlocks.$inferSelect)[],
  names: Map<string, string>,
): Promise<ResolvedBlock[]> {
  if (rows.length === 0) return [];

  const taskIds = rows.filter((r) => r.kind === "task" && r.refId).map((r) => r.refId as string);
  const topicIds = rows.filter((r) => r.kind !== "task" && r.refId).map((r) => r.refId as string);

  const taskRows =
    taskIds.length > 0
      ? await db.orm
          .select()
          .from(tasks)
          .where(and(inArray(tasks.id, taskIds), eq(tasks.userId, profileId)))
      : [];
  // Task-linked topics resolve the subject fallback when a task has no subject of its own.
  for (const t of taskRows) if (t.topicId) topicIds.push(t.topicId);

  const uniqueTopics = [...new Set(topicIds)];
  const topicRows =
    uniqueTopics.length > 0
      ? await db.orm
          .select({ id: topics.id, name: topics.name, subjectId: topics.subjectId })
          .from(topics)
          .innerJoin(subjects, eq(topics.subjectId, subjects.id))
          .where(and(eq(subjects.userId, profileId), inArray(topics.id, uniqueTopics)))
      : [];

  const taskMap = new Map(taskRows.map((t) => [t.id, t]));
  const topicMap = new Map(topicRows.map((t) => [t.id, t]));

  const out: ResolvedBlock[] = [];
  for (const r of rows) {
    const base = {
      id: r.id,
      kind: r.kind as BlockKind,
      refId: r.refId,
      plannedMin: r.plannedMin,
      status: r.status as BlockStatus,
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      orderIndex: r.orderIndex,
    };

    if (r.refId === null) {
      // No reference to join: a hand-made block carries its own wording (none today).
      out.push({
        ...base,
        title: r.kind === "session" ? "Focus session" : "Study block",
        subjectId: null,
        subjectName: null,
      });
      continue;
    }

    if (r.kind === "task") {
      const task = taskMap.get(r.refId);
      if (!task) continue;
      const subjectId =
        task.subjectId ?? (task.topicId ? (topicMap.get(task.topicId)?.subjectId ?? null) : null);
      out.push({
        ...base,
        title: blockTitle("task", { title: task.title }),
        subjectId,
        subjectName: subjectId ? (names.get(subjectId) ?? null) : null,
      });
      continue;
    }

    const topic = topicMap.get(r.refId);
    if (!topic) continue;
    out.push({
      ...base,
      title: blockTitle(base.kind, { name: topic.name }),
      subjectId: topic.subjectId,
      subjectName: names.get(topic.subjectId) ?? null,
    });
  }
  return out;
}

const serialisePlan = (row: typeof plans.$inferSelect) => ({
  id: row.id,
  date: row.date,
  mode: row.mode,
  status: row.status,
  generatedAt: row.generatedAt ? row.generatedAt.toISOString() : null,
});

async function blockOr404(profileId: string, blockId: string) {
  const [row] = await db.orm
    .select({ block: planBlocks })
    .from(planBlocks)
    .innerJoin(plans, eq(planBlocks.planId, plans.id))
    .where(and(eq(planBlocks.id, blockId), eq(plans.userId, profileId)))
    .limit(1);
  return row ?? null;
}

/* --- reads ---------------------------------------------------------------- */

/**
 * GET /api/plan?date=YYYY-MM-DD — the whole day in one response: the plan, its
 * resolved blocks, the suggested-mode tray, and how much of the capacity the day uses.
 * Materialisation runs first so recurring work is visible to the candidate engine,
 * following the same on-read rule as the tasks list (ADR-017).
 */
planRouter.get("/", async (c) => {
  const profileId = c.get("profileId");
  const dateParsed = planDateSchema.safeParse(c.req.query("date") ?? localDate(new Date()));
  if (!dateParsed.success) return badRequest(dateParsed.error.issues);
  const date = dateParsed.data;

  await materialiseOccurrences(profileId);

  const plan = await ensurePlan(profileId, date);
  const rows = await db.orm
    .select()
    .from(planBlocks)
    .where(eq(planBlocks.planId, plan.id))
    .orderBy(asc(planBlocks.orderIndex), asc(planBlocks.id));

  const capacityMin = await capacityOf(profileId);
  const names = await subjectNames(profileId);
  const visible = rows.filter((r) => r.status !== "dismissed");
  const blocks = await resolveBlocks(profileId, visible, names);

  let suggestions: DayCandidate[] = [];
  if (plan.mode === "suggested") {
    const taskSnaps = await openTaskSnapshots(profileId);
    const topicIds = taskSnaps.flatMap((t) => (t.topicId ? [t.topicId] : []));
    const topicSnaps = await topicSnapshots(profileId, topicIds);
    suggestions = dayCandidates({
      tasks: taskSnaps,
      topicsById: Object.fromEntries(topicSnaps),
      // Any row blocks its ref — done, pending or dismissed alike.
      blockedRefs: rows.flatMap((r) => (r.refId ? [r.refId] : [])),
      now: new Date(),
    });
  }

  const load = planLoad(blocks, capacityMin);

  return Response.json({
    plan: serialisePlan(plan),
    blocks,
    suggestions,
    capacityMin,
    load,
  });
});

/* --- mode and generation --------------------------------------------------- */

/** POST /api/plan — ensure the day and optionally set its mode (manual has no generate). */
planRouter.post("/", async (c) => {
  const profileId = c.get("profileId");
  const body = await c.req.json().catch(() => null);
  const parsed = createPlanSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const plan = await ensurePlan(profileId, parsed.data.date);
  if (parsed.data.mode && parsed.data.mode !== plan.mode) {
    const [updated] = await db.orm
      .update(plans)
      .set({ mode: parsed.data.mode })
      .where(eq(plans.id, plan.id))
      .returning();
    return Response.json({ plan: serialisePlan(updated ?? plan) });
  }
  return Response.json({ plan: serialisePlan(plan) });
});

/**
 * POST /api/plan/generate — rebuild the day for its mode.
 *
 * suggested: clear un-started rows back into the tray (done + dismissed stay).
 * automatic: same, then fill to capacity from deadlines and mastery.
 * manual: untouched — the student's schedule is not ours to rewrite.
 */
planRouter.post("/generate", async (c) => {
  const profileId = c.get("profileId");
  const body = await c.req.json().catch(() => null);
  const parsed = generatePlanSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const input = parsed.data;

  let plan = await ensurePlan(profileId, input.date);
  if (input.mode && input.mode !== plan.mode) {
    const [updated] = await db.orm
      .update(plans)
      .set({ mode: input.mode })
      .where(eq(plans.id, plan.id))
      .returning();
    plan = updated ?? plan;
  }
  if (plan.mode === "manual") {
    return Response.json({ plan: serialisePlan(plan), generated: 0 });
  }

  const rows = await db.orm
    .select()
    .from(planBlocks)
    .where(eq(planBlocks.planId, plan.id))
    .orderBy(asc(planBlocks.orderIndex), asc(planBlocks.id));

  const kept = input.keepDone ? rows.filter((r) => r.status === "done") : [];
  const dismissed = rows.filter((r) => r.status === "dismissed");
  const keepIds = new Set([...kept.map((r) => r.id), ...dismissed.map((r) => r.id)]);
  const drop = rows.filter((r) => !keepIds.has(r.id));
  if (drop.length > 0) {
    await db.orm.delete(planBlocks).where(
      inArray(
        planBlocks.id,
        drop.map((r) => r.id),
      ),
    );
  }

  let generated = 0;
  if (plan.mode === "automatic") {
    const [taskSnaps, topicIds] = await Promise.all([
      openTaskSnapshots(profileId),
      ownedTopicIds(profileId),
    ]);
    const topicSnaps = await topicSnapshots(profileId, topicIds);
    const drafts = generateBlocks({
      tasks: taskSnaps,
      topics: [...topicSnaps.values()],
      keep: kept.map<BlockSnapshot>((r) => ({
        id: r.id,
        kind: r.kind as BlockKind,
        refId: r.refId,
        plannedMin: r.plannedMin,
        status: r.status as BlockStatus,
      })),
      excludeRefs: dismissed.flatMap((r) => (r.refId ? [r.refId] : [])),
      capacityMin: await capacityOf(profileId),
      now: new Date(),
    });

    // Kept rows compact first, new work follows — one honest order, no index gaps.
    let order = 0;
    for (const row of kept) {
      if (row.orderIndex !== order) {
        await db.orm.update(planBlocks).set({ orderIndex: order }).where(eq(planBlocks.id, row.id));
      }
      order += 1;
    }
    if (drafts.length > 0) {
      await db.orm.insert(planBlocks).values(
        drafts.map((d, i) => ({
          planId: plan.id,
          orderIndex: order + i,
          kind: d.kind,
          refId: d.refId,
          plannedMin: d.plannedMin,
          status: "pending",
        })),
      );
      generated = drafts.length;
    }
  }

  await db.orm.update(plans).set({ generatedAt: new Date() }).where(eq(plans.id, plan.id));
  await touchStatus(plan.id);
  return Response.json({ plan: serialisePlan(plan), generated });
});

/* --- blocks ---------------------------------------------------------------- */

/** POST /api/plan/blocks — accept suggestions or add manually; duplicates collapse. */
planRouter.post("/blocks", async (c) => {
  const profileId = c.get("profileId");
  const body = await c.req.json().catch(() => null);
  const parsed = addBlocksSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const plan = await ensurePlan(profileId, parsed.data.date);
  const existing = await db.orm.select().from(planBlocks).where(eq(planBlocks.planId, plan.id));
  const maxOrder = existing.reduce((m, r) => Math.max(m, r.orderIndex), -1);
  let order = maxOrder;
  let added = 0;
  // One ref, one row — even when the same ref appears twice in this very batch.
  const seen = new Set<string>();

  for (const b of parsed.data.blocks) {
    const key = `${b.kind}:${b.refId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const owned =
      b.kind === "task" ? await ownsTask(profileId, b.refId) : await ownsTopic(profileId, b.refId);
    if (!owned) return notFound();

    const clash = existing.find((r) => r.kind === b.kind && r.refId === b.refId);
    if (clash && (clash.status === "pending" || clash.status === "done")) continue;
    if (clash) {
      // A dismissed row re-accepts in place — same ref, one row, no ghost history.
      await db.orm
        .update(planBlocks)
        .set({ status: "pending", plannedMin: b.plannedMin, completedAt: null })
        .where(eq(planBlocks.id, clash.id));
    } else {
      order += 1;
      await db.orm.insert(planBlocks).values({
        planId: plan.id,
        orderIndex: order,
        kind: b.kind,
        refId: b.refId,
        plannedMin: b.plannedMin,
        status: "pending",
      });
    }
    added += 1;
  }

  await touchStatus(plan.id);
  return Response.json({ added }, { status: 201 });
});

/**
 * POST /api/plan/dismiss — "not today" for a suggested candidate. Stored as a
 * dismissed row so the tray stays quiet across a refresh, and re-offered tomorrow.
 */
planRouter.post("/dismiss", async (c) => {
  const profileId = c.get("profileId");
  const body = await c.req.json().catch(() => null);
  const parsed = dismissCandidateSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const plan = await ensurePlan(profileId, parsed.data.date);
  if (!(await ownsTask(profileId, parsed.data.taskId))) return notFound();

  const rows = await db.orm.select().from(planBlocks).where(eq(planBlocks.planId, plan.id));
  const clash = rows.find((r) => r.kind === "task" && r.refId === parsed.data.taskId);
  if (clash && clash.status !== "pending") {
    // Done stays done; a second dismissal is a no-op.
    return Response.json({ ok: true });
  }
  if (clash) {
    await db.orm
      .update(planBlocks)
      .set({ status: "dismissed", completedAt: null })
      .where(eq(planBlocks.id, clash.id));
  } else {
    const order = rows.reduce((m, r) => Math.max(m, r.orderIndex), -1) + 1;
    await db.orm.insert(planBlocks).values({
      planId: plan.id,
      orderIndex: order,
      kind: "task",
      refId: parsed.data.taskId,
      plannedMin: 0,
      status: "dismissed",
    });
  }
  await touchStatus(plan.id);
  return Response.json({ ok: true });
});

/**
 * PATCH /api/plan/blocks/:id — minutes, or a status change.
 *
 * Task-kind blocks delegate completion to `taskActions` (XP, streaks and every other
 * block of the same task move together); other kinds complete here and count as a
 * study day without minting XP twice for one activity.
 */
planRouter.patch("/blocks/:id", async (c) => {
  const profileId = c.get("profileId");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = updateBlockSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const found = await blockOr404(profileId, id);
  if (!found) return notFound();
  const row = found.block;

  const names = await subjectNames(profileId);
  const changes: Partial<typeof planBlocks.$inferInsert> = {};
  if (parsed.data.plannedMin !== undefined) changes.plannedMin = parsed.data.plannedMin;

  if (parsed.data.status !== undefined && parsed.data.status !== row.status) {
    const status = parsed.data.status;
    if (row.kind === "task" && row.refId) {
      if (status === "done") {
        const done = await completeTask(profileId, row.refId);
        if (!done) return notFound();
      } else if (status === "pending") {
        const reopened = await uncompleteTask(profileId, row.refId);
        if (!reopened) return notFound();
      } else {
        changes.status = status;
        changes.completedAt = null;
      }
    } else {
      changes.status = status;
      changes.completedAt = status === "done" ? new Date() : null;
      if (status === "done") await recordActivity(profileId);
    }
  }

  if (Object.keys(changes).length > 0) {
    await db.orm
      .update(planBlocks)
      .set(changes)
      .where(and(eq(planBlocks.id, row.id), eq(planBlocks.planId, row.planId)));
    await touchStatus(row.planId);
  }

  const fresh = await db.orm.select().from(planBlocks).where(eq(planBlocks.id, row.id)).limit(1);
  const [resolved] = await resolveBlocks(profileId, fresh, names);
  if (!resolved) return notFound();
  return Response.json({ block: resolved });
});

/** DELETE /api/plan/blocks/:id — take the block out of the day; the task itself stays. */
planRouter.delete("/blocks/:id", async (c) => {
  const profileId = c.get("profileId");
  const id = c.req.param("id");

  const found = await blockOr404(profileId, id);
  if (!found) return notFound();

  await db.orm.delete(planBlocks).where(eq(planBlocks.id, found.block.id));
  await touchStatus(found.block.planId);
  return Response.json({ ok: true });
});

/**
 * POST /api/plan/reorder — the student's own order, persisted as integers so a
 * refresh restores the sequence exactly. The client sends the full visible order.
 */
planRouter.post("/reorder", async (c) => {
  const profileId = c.get("profileId");
  const body = await c.req.json().catch(() => null);
  const parsed = reorderPlanSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const plan = await ensurePlan(profileId, parsed.data.date);
  const rows = await db.orm
    .select({ id: planBlocks.id })
    .from(planBlocks)
    .where(eq(planBlocks.planId, plan.id));
  const owned = new Set(rows.map((r) => r.id));
  const unique = new Set(parsed.data.ids);
  if (unique.size !== parsed.data.ids.length || parsed.data.ids.some((i) => !owned.has(i))) {
    return badRequest([{ message: "ids must be this plan's blocks, each listed once" }]);
  }

  for (const [index, blockId] of parsed.data.ids.entries()) {
    await db.orm.update(planBlocks).set({ orderIndex: index }).where(eq(planBlocks.id, blockId));
  }
  return Response.json({ ok: true });
});

/** POST /api/plan/capacity — the one place "available study time" is written. */
planRouter.post("/capacity", async (c) => {
  const profileId = c.get("profileId");
  const body = await c.req.json().catch(() => null);
  const parsed = capacitySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const [row] = await db.orm
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, profileId))
    .limit(1);
  const settings = (row?.settings ?? {}) as { planning?: { dailyMinutes?: number } };
  const next = {
    ...settings,
    planning: { ...settings.planning, dailyMinutes: parsed.data.minutes },
  };
  await db.orm.update(users).set({ settings: next }).where(eq(users.id, profileId));

  return Response.json({ capacityMin: parsed.data.minutes });
});

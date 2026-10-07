/**
 * Task completion as one service (P11, extended by P12): the XP award, the streak
 * tick, and the day plan's view of the same event all move together.
 *
 * - Completing a task completes every pending plan block holding it — on any day.
 *   There is one truth about whether the work happened, so the quest can never show
 *   "still to do" for something the student already finished on the Tasks page.
 * - Un-completing puts those blocks back — symmetric, so undo never lies.
 * - Blocks of other kinds earn no XP of their own: the activity they point at has its
 *   own reward coming. Completing them still counts as a study day for the streak,
 *   because a finished block is finished work (PRD section 22: real work only).
 */
import { and, eq, inArray } from "drizzle-orm";

import { XP } from "@sq/core/gamification";
import { planBlocks, plans, tasks } from "@sq/db/schema";

import { db } from "../db.ts";
import { awardXp, recordActivity, revokeXp } from "./xp.ts";

const xpSource = (userId: string, taskId: string) => ({
  userId,
  reason: "task_complete",
  sourceType: "task",
  sourceId: taskId,
});

/** Every plan row id the caller owns — plan blocks are only reachable through these. */
async function planIdsOf(userId: string): Promise<string[]> {
  const rows = await db.orm.select({ id: plans.id }).from(plans).where(eq(plans.userId, userId));
  return rows.map((r) => r.id);
}

export interface CompleteResult {
  task: typeof tasks.$inferSelect;
  xpAwarded: number;
  streak: number | null;
}

/**
 * Complete a task: status, plan blocks, XP (idempotent) and streak, in that order.
 * Returns null when the task does not belong to the caller.
 */
export async function completeTask(
  profileId: string,
  taskId: string,
): Promise<CompleteResult | null> {
  const [task] = await db.orm
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, profileId)))
    .limit(1);
  if (!task) return null;
  if (task.status === "done") return { task, xpAwarded: 0, streak: null };

  const [updated] = await db.orm
    .update(tasks)
    .set({ status: "done", completedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, profileId)))
    .returning();

  const planIds = await planIdsOf(profileId);
  if (planIds.length > 0) {
    await db.orm
      .update(planBlocks)
      .set({ status: "done", completedAt: new Date() })
      .where(
        and(
          inArray(planBlocks.planId, planIds),
          eq(planBlocks.refId, taskId),
          eq(planBlocks.kind, "task"),
          eq(planBlocks.status, "pending"),
        ),
      );
  }

  const xpAwarded = await awardXp({ delta: XP.task, ...xpSource(profileId, taskId) });
  const streak = await recordActivity(profileId);
  return { task: updated ?? task, xpAwarded, streak: streak.current };
}

/**
 * Reopen a task (or un-skip it): the task, its plan blocks and the XP all go back.
 * A skipped row never held XP, so the revoke is a harmless no-op there.
 */
export async function uncompleteTask(
  profileId: string,
  taskId: string,
): Promise<{ task: typeof tasks.$inferSelect } | null> {
  const [task] = await db.orm
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, profileId)))
    .limit(1);
  if (!task) return null;
  if (task.status === "open") return { task };

  const [updated] = await db.orm
    .update(tasks)
    .set({ status: "open", completedAt: null })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, profileId)))
    .returning();

  const planIds = await planIdsOf(profileId);
  if (planIds.length > 0) {
    await db.orm
      .update(planBlocks)
      .set({ status: "pending", completedAt: null })
      .where(
        and(
          inArray(planBlocks.planId, planIds),
          eq(planBlocks.refId, taskId),
          eq(planBlocks.kind, "task"),
          eq(planBlocks.status, "done"),
        ),
      );
  }

  await revokeXp(xpSource(profileId, taskId));
  return { task: updated ?? task };
}

/** Plan blocks die with the tasks they point at — a deleted task leaves no ghosts. */
export async function dropBlocksForTasks(taskIds: readonly string[]): Promise<void> {
  if (taskIds.length === 0) return;
  await db.orm.delete(planBlocks).where(inArray(planBlocks.refId, [...taskIds]));
}

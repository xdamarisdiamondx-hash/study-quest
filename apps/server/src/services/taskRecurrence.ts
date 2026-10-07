/**
 * Occurrence materialisation for recurring task series (P11, ADR-017).
 *
 * `task_recurrences.next_at` is the cursor: each run creates every missing row from the
 * cursor (never a day already gone) up to 14 days ahead, then parks the cursor after the
 * horizon. Runs are idempotent — an exact due instant is never inserted twice — so the
 * task list can call this on every read instead of depending on a scheduler process
 * being alive. P18 adds process-level scheduling on top; this write path won't change.
 *
 * The anchor (the series' first date) lives on the rule row, so skipping or re-pointing
 * the head occurrence can never shift the phase of what comes after it.
 */
import { eq } from "drizzle-orm";

import {
  MATERIALISE_DAYS,
  nextOccurrence,
  occurrencesBetween,
  startOfDay,
  type RecurrenceRule,
} from "@sq/core/tasks";
import { taskRecurrences, tasks } from "@sq/db/schema";

import { db } from "../db.ts";

const DAY_MS = 86_400_000;

function ruleOf(row: typeof taskRecurrences.$inferSelect): RecurrenceRule {
  return {
    freq: row.freq as RecurrenceRule["freq"],
    interval: row.interval,
    byWeekday: row.byWeekday,
    untilAt: row.untilAt ? row.untilAt.toISOString() : null,
  };
}

/** Materialise every series the caller owns. Safe to call on every list read. */
export async function materialiseOccurrences(userId: string, now = new Date()): Promise<void> {
  const series = await db.orm
    .select({ rec: taskRecurrences, head: tasks })
    .from(taskRecurrences)
    .innerJoin(tasks, eq(taskRecurrences.taskId, tasks.id))
    .where(eq(tasks.userId, userId));
  if (series.length === 0) return;

  const todayStart = startOfDay(now);
  // End of the 14th day counting today: today … today + 13.
  const horizon = new Date(todayStart.getTime() + MATERIALISE_DAYS * DAY_MS - 1);

  for (const { rec, head } of series) {
    const rule = ruleOf(rec);
    if (rule.untilAt && new Date(rule.untilAt).getTime() < todayStart.getTime()) continue;

    const anchor = rec.anchorAt ?? head.dueAt ?? head.createdAt;
    // A cursor that went stale (nothing read the list for a week) jumps to today rather
    // than spawning a backlog of already-missed days.
    const from =
      rec.nextAt && rec.nextAt.getTime() > todayStart.getTime() ? rec.nextAt : todayStart;
    const dates = occurrencesBetween(anchor, rule, from, horizon);
    if (dates.length === 0) continue;

    const existing = await db.orm
      .select({ dueAt: tasks.dueAt })
      .from(tasks)
      .where(eq(tasks.recurrenceId, rec.id));
    const have = new Set(existing.flatMap((r) => (r.dueAt ? [r.dueAt.getTime()] : [])));
    const fresh = dates.filter((d) => !have.has(d.getTime()));

    if (fresh.length > 0) {
      await db.orm.insert(tasks).values(
        fresh.map((dueAt) => ({
          userId,
          title: head.title,
          subjectId: head.subjectId,
          topicId: head.topicId,
          kind: head.kind,
          priority: head.priority,
          dueAt,
          estimateMin: head.estimateMin,
          notes: head.notes,
          status: "open",
          recurrenceId: rec.id,
        })),
      );
    }

    const last = dates[dates.length - 1];
    const next = last ? nextOccurrence(anchor, rule, last) : null;
    if ((next?.getTime() ?? null) !== (rec.nextAt?.getTime() ?? null)) {
      await db.orm
        .update(taskRecurrences)
        .set({ nextAt: next })
        .where(eq(taskRecurrences.id, rec.id));
    }
  }
}

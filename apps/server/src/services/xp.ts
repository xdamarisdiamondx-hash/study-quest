/**
 * The single writer for XP awards and streak activity (P11, grown by P15).
 *
 * Two invariants live here so every route inherits them:
 *
 * - Awards are idempotent: the ledger's unique (user, reason, source, id) key means a
 *   retry, a double-click or a re-award sets the same number again instead of adding to
 *   it (ADR-015). A "revoke" is a delete of that exact row, which is what makes
 *   un-completing a task actually give the XP back.
 * - Streaks only move on real work: `recordActivity` is called from completions, never
 *   from opening the app (PRD §22 anti-pattern).
 */
import { and, eq, gte, lt, sql } from "drizzle-orm";

import { registerActivity, type StreakState } from "@sq/core/gamification";
import { activityLog, streaks, xpLedger } from "@sq/db/schema";

import { db } from "../db.ts";

export interface XpSource {
  userId: string;
  delta: number;
  reason: string;
  sourceType: string;
  sourceId: string;
}

/** Award XP for one source of work. Returns the delta standing in the ledger (0 if none). */
export async function awardXp(a: XpSource): Promise<number> {
  if (a.delta <= 0) return 0;
  await db.orm
    .insert(xpLedger)
    .values(a)
    .onConflictDoUpdate({
      target: [xpLedger.userId, xpLedger.reason, xpLedger.sourceType, xpLedger.sourceId],
      set: { delta: a.delta },
    });
  return a.delta;
}

/** Take back the award for one source (an undo). Does nothing if nothing was awarded. */
export async function revokeXp(a: Omit<XpSource, "delta">): Promise<void> {
  await db.orm
    .delete(xpLedger)
    .where(
      and(
        eq(xpLedger.userId, a.userId),
        eq(xpLedger.reason, a.reason),
        eq(xpLedger.sourceType, a.sourceType),
        eq(xpLedger.sourceId, a.sourceId),
      ),
    );
}

/** The account's total XP, computed from the ledger — never a denormalised counter. */
export async function totalXp(userId: string): Promise<number> {
  const [row] = await db.orm
    .select({ n: sql<number>`coalesce(sum(${xpLedger.delta}), 0)::int` })
    .from(xpLedger)
    .where(eq(xpLedger.userId, userId));
  return row?.n ?? 0;
}

const EMPTY: StreakState = { current: 0, longest: 0, lastActiveDate: null, freezeCount: 0 };

/** The caller's streak row, creating the zero row on first use. */
export async function loadStreak(userId: string): Promise<StreakState> {
  const [row] = await db.orm.select().from(streaks).where(eq(streaks.userId, userId)).limit(1);
  if (row) {
    return {
      current: row.current,
      longest: row.longest,
      lastActiveDate: row.lastActiveDate,
      freezeCount: row.freezeCount,
    };
  }
  await db.orm
    .insert(streaks)
    .values({ userId, ...EMPTY })
    .onConflictDoNothing();
  return EMPTY;
}

/**
 * Count today as a day of real work. `registerActivity` returns the same object when
 * the day already counts, so a hundred completions in one afternoon update nothing.
 */
export async function recordActivity(userId: string, on = new Date()): Promise<StreakState> {
  const before = await loadStreak(userId);
  const next = registerActivity(before, on);
  if (next !== before) {
    await db.orm
      .update(streaks)
      .set({
        current: next.current,
        longest: next.longest,
        lastActiveDate: next.lastActiveDate,
        freezeCount: next.freezeCount,
      })
      .where(eq(streaks.userId, userId));

    // A spent freeze means a gap day was absorbed into the streak; it belongs
    // on the calendar too, or the grid would show a hole the streak never had.
    if (next.freezeCount < before.freezeCount) {
      const gap = new Date(on);
      gap.setDate(gap.getDate() - 1);
      await markStudyDay(userId, gap);
    }
  }

  // The calendar counts every day with recorded activity — the streak moved or
  // not. Gating this on movement stranded a day whose first activity predated
  // P15 (the row was never written, and no later activity could write it);
  // `markStudyDay` dedupes anyway, so the hundredth completion of one afternoon
  // is still a no-op.
  await markStudyDay(userId, on);
  return next;
}

/** Idempotent: at most one `study_day` row may exist for a given local day. */
async function markStudyDay(userId: string, on: Date): Promise<void> {
  const start = new Date(on);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);

  const [dupe] = await db.orm
    .select({ id: activityLog.id })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.userId, userId),
        eq(activityLog.kind, "study_day"),
        gte(activityLog.createdAt, start),
        lt(activityLog.createdAt, end),
      ),
    )
    .limit(1);
  if (dupe) return;

  await db.orm
    .insert(activityLog)
    .values({ userId, kind: "study_day", createdAt: on })
    .onConflictDoNothing();
}

/**
 * Reminders (P18, PRD §28): the server half of the scheduler. Every timing
 * decision lives in the pure engine (`@sq/core/reminders`); this file only
 * gathers the snapshots the rules read, applies the plan the engine returns
 * (insert candidates, drop dead rows), and flips rows to delivered when their
 * moment has come — the catch-up window already vetted them (ADR-017).
 *
 * The gather mirrors P17's `recommendationsView` on purpose: same open tasks,
 * same plan remainder, same streak row, so a nudge and the card under it never
 * disagree about the state of the day. Copy is frozen into the row at insert
 * (ADR-016's history exception): the centre is a record of what was said, not
 * a live recomputation.
 *
 * Settings are a single row per account with per-type *overrides* — a missing
 * row is the default (everything on, quiet 22:00–07:00), which is why a fresh
 * account nudges without ever visiting the settings page.
 */
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lt, lte } from "drizzle-orm";

import { localDate } from "@sq/core/planning";
import { weekStartKey } from "@sq/core/progress";
import {
  CATCHUP_HOURS,
  DEFAULT_REMINDER_SETTINGS,
  HISTORY_DAYS,
  REMINDER_HOURS,
  REMINDER_TYPES,
  SNOOZE_MINUTES,
  nextFires,
  reminderSyncPlan,
  typeEnabled,
  type ExistingReminder,
  type NextFire,
  type ReminderInput,
  type ReminderSettings,
  type ReminderType,
} from "@sq/core/reminders";
import { planBlocks, plans, reminderSettings, reminders, studySessions } from "@sq/db/schema";

import { db } from "../db.ts";
import { listQuests } from "./quests.ts";
import { openTaskSnapshots, ownedTopicIds, topicSnapshots } from "./planning.ts";
import { loadStreak } from "./xp.ts";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/* --- settings -------------------------------------------------------------- */

/** The account's row, or the defaults — "missing row means on" is the contract. */
export async function loadSettings(profileId: string): Promise<ReminderSettings> {
  const [row] = await db.orm
    .select()
    .from(reminderSettings)
    .where(eq(reminderSettings.userId, profileId))
    .limit(1);
  if (!row) return DEFAULT_REMINDER_SETTINGS;
  return {
    enabled: row.enabled as Partial<Record<ReminderType, boolean>>,
    quietStart: row.quietStart,
    quietEnd: row.quietEnd,
  };
}

export interface SettingsPatch {
  enabled?: Partial<Record<ReminderType, boolean>>;
  quietStart?: string;
  quietEnd?: string;
}

/**
 * Merge the patch into the row (a client may send one switch without knowing
 * the rest) and apply it immediately: pending rows of a type the student just
 * switched off are deleted here rather than waiting for the next tick — the
 * API answer and the account state agree by the time the response lands.
 */
export async function updateSettings(
  profileId: string,
  patch: SettingsPatch,
): Promise<ReminderSettings> {
  const before = await loadSettings(profileId);
  const next: ReminderSettings = {
    enabled: patch.enabled ? { ...before.enabled, ...patch.enabled } : before.enabled,
    quietStart: patch.quietStart ?? before.quietStart,
    quietEnd: patch.quietEnd ?? before.quietEnd,
  };

  await db.orm
    .insert(reminderSettings)
    .values({
      userId: profileId,
      enabled: next.enabled,
      quietStart: next.quietStart,
      quietEnd: next.quietEnd,
    })
    .onConflictDoUpdate({
      target: reminderSettings.userId,
      set: { enabled: next.enabled, quietStart: next.quietStart, quietEnd: next.quietEnd },
    });

  const off = REMINDER_TYPES.filter((t) => !typeEnabled(next, t));
  if (off.length > 0) {
    await db.orm
      .delete(reminders)
      .where(
        and(
          eq(reminders.userId, profileId),
          isNull(reminders.deliveredAt),
          inArray(reminders.type, off),
        ),
      );
  }
  return next;
}

/* --- gathers --------------------------------------------------------------- */

/** Today's plan as the engine reads it: identity plus the pending remainder. */
async function planSummary(profileId: string, date: string) {
  const [plan] = await db.orm
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.userId, profileId), eq(plans.date, date)))
    .limit(1);
  if (!plan) return null;

  const blocks = await db.orm
    .select({ status: planBlocks.status })
    .from(planBlocks)
    .where(eq(planBlocks.planId, plan.id));
  const pending = blocks.filter((b) => b.status === "pending").length;
  const total = blocks.filter((b) => b.status !== "dismissed").length;
  return { id: plan.id, date, pending, total };
}

/**
 * Minutes in the last closed week (Mon–Sun, A.8's week) — the digest's
 * numbers. On Monday before the 09:00 slot the freshly started week says
 * nothing yet, so the previous week is the one just closed: a machine that was
 * off all Sunday still gets Monday's digest.
 */
async function digestMinutes(profileId: string, now: Date): Promise<number> {
  const earlyMonday = now.getDay() === 1 && now.getHours() < REMINDER_HOURS.digest;
  const ref = earlyMonday ? new Date(now.getTime() - 7 * DAY_MS) : now;
  const fromKey = weekStartKey(ref);
  const from = new Date(`${fromKey}T00:00:00`);
  const until = new Date(`${fromKey}T00:00:00`);
  until.setDate(until.getDate() + 7);

  const rows = await db.orm
    .select({ focusMin: studySessions.focusMin })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.userId, profileId),
        eq(studySessions.status, "completed"),
        gte(studySessions.endedAt, from),
        lt(studySessions.endedAt, until),
      ),
    );
  return rows.reduce((n, r) => n + r.focusMin, 0);
}

/** Everything `reminderSyncPlan` and `nextFires` need, in one gather. */
export async function gather(profileId: string, now: Date): Promise<ReminderInput> {
  const [settings, tasks, plan, questRows, topicIds, streak, weekMinutes] = await Promise.all([
    loadSettings(profileId),
    openTaskSnapshots(profileId),
    planSummary(profileId, localDate(now)),
    listQuests(profileId),
    ownedTopicIds(profileId),
    loadStreak(profileId),
    digestMinutes(profileId, now),
  ]);
  const topics = await topicSnapshots(profileId, topicIds, now);
  let dueCardCount = 0;
  for (const topic of topics.values()) dueCardCount += topic.assets.dueCards;

  return {
    now,
    settings,
    tasks,
    plan,
    quests: questRows.active.map((q) => ({
      id: q.id,
      title: q.title,
      dueAt: q.dueAt,
      active: q.status === "active",
    })),
    dueCardCount,
    streak: { current: streak.current, lastActiveDate: streak.lastActiveDate },
    digest: weekMinutes > 0 ? { weekMinutes } : null,
  };
}

/** Rows the sync may still act on: the history window, in the engine's shape. */
async function existingRows(profileId: string, now: Date): Promise<ExistingReminder[]> {
  const rows = await db.orm
    .select({
      id: reminders.id,
      type: reminders.type,
      refType: reminders.refType,
      refId: reminders.refId,
      fireAt: reminders.fireAt,
      deliveredAt: reminders.deliveredAt,
    })
    .from(reminders)
    .where(
      and(
        eq(reminders.userId, profileId),
        gte(reminders.fireAt, new Date(now.getTime() - HISTORY_DAYS * DAY_MS)),
      ),
    );
  return rows
    .filter((r) => (REMINDER_TYPES as readonly string[]).includes(r.type))
    .map((r) => ({
      id: r.id,
      type: r.type as ReminderType,
      refType: r.refType,
      refId: r.refId,
      fireAt: r.fireAt.toISOString(),
      deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
    }));
}

/* --- the tick -------------------------------------------------------------- */

export interface SyncOutcome {
  created: number;
  dropped: number;
  delivered: number;
  pruned: number;
}

/**
 * One account's tick: materialise the slots the engine wants, remove the ones
 * whose moment passed or whose event is gone, then deliver everything whose
 * `fireAt` has arrived — the sync's own catch-up filter is what makes that
 * update safe (no stale row survives it). Delivered rows older than the
 * history window are pruned; they have been read or ignored by then.
 */
export async function remindersSync(profileId: string, now = new Date()): Promise<SyncOutcome> {
  const input = await gather(profileId, now);
  const existing = await existingRows(profileId, now);
  const plan = reminderSyncPlan(input, existing);

  if (plan.dropIds.length > 0) {
    await db.orm
      .delete(reminders)
      .where(and(eq(reminders.userId, profileId), inArray(reminders.id, plan.dropIds)));
  }
  if (plan.create.length > 0) {
    await db.orm.insert(reminders).values(
      plan.create.map((c) => ({
        userId: profileId,
        type: c.type,
        refType: c.refType,
        refId: c.refId,
        fireAt: new Date(c.fireAt),
        title: c.title,
        body: c.body,
        href: c.href,
      })),
    );
  }

  const delivered = await db.orm
    .update(reminders)
    .set({ deliveredAt: now, snoozedUntil: null })
    .where(
      and(
        eq(reminders.userId, profileId),
        isNull(reminders.deliveredAt),
        lte(reminders.fireAt, now),
        gte(reminders.fireAt, new Date(now.getTime() - CATCHUP_HOURS * HOUR_MS)),
      ),
    )
    .returning({ id: reminders.id });

  const pruned = await db.orm
    .delete(reminders)
    .where(
      and(
        eq(reminders.userId, profileId),
        lt(reminders.fireAt, new Date(now.getTime() - HISTORY_DAYS * DAY_MS)),
      ),
    )
    .returning({ id: reminders.id });

  return {
    created: plan.create.length,
    dropped: plan.dropIds.length,
    delivered: delivered.length,
    pruned: pruned.length,
  };
}

/* --- the centre ------------------------------------------------------------ */

/** What the bell shows: delivered rows, newest first, and the unread count. */
export async function remindersCentre(profileId: string): Promise<{
  reminders: Array<{
    id: string;
    type: ReminderType;
    title: string;
    body: string;
    href: string;
    fireAt: string;
    deliveredAt: string;
    readAt: string | null;
  }>;
  unread: number;
}> {
  const [rows, [unreadRow]] = await Promise.all([
    db.orm
      .select({
        id: reminders.id,
        type: reminders.type,
        title: reminders.title,
        body: reminders.body,
        href: reminders.href,
        fireAt: reminders.fireAt,
        deliveredAt: reminders.deliveredAt,
        readAt: reminders.readAt,
      })
      .from(reminders)
      .where(and(eq(reminders.userId, profileId), isNotNull(reminders.deliveredAt)))
      .orderBy(desc(reminders.fireAt))
      .limit(50),
    db.orm
      .select({ n: count() })
      .from(reminders)
      .where(
        and(
          eq(reminders.userId, profileId),
          isNotNull(reminders.deliveredAt),
          isNull(reminders.readAt),
        ),
      ),
  ]);

  return {
    reminders: rows
      .filter((r) => (REMINDER_TYPES as readonly string[]).includes(r.type) && r.deliveredAt)
      .map((r) => ({
        id: r.id,
        type: r.type as ReminderType,
        title: r.title,
        body: r.body,
        href: r.href,
        fireAt: r.fireAt.toISOString(),
        deliveredAt: (r.deliveredAt as Date).toISOString(),
        readAt: r.readAt ? r.readAt.toISOString() : null,
      })),
    unread: unreadRow?.n ?? 0,
  };
}

/** Mark one delivered row read — idempotent, and scoped to the owner. */
export async function markRead(profileId: string, id: string): Promise<boolean> {
  const rows = await db.orm
    .update(reminders)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(reminders.id, id),
        eq(reminders.userId, profileId),
        isNotNull(reminders.deliveredAt),
        isNull(reminders.readAt),
      ),
    )
    .returning({ id: reminders.id });
  return rows.length > 0;
}

/** "Read all": one update, the badge goes to zero. */
export async function markAllRead(profileId: string): Promise<number> {
  const rows = await db.orm
    .update(reminders)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(reminders.userId, profileId),
        isNotNull(reminders.deliveredAt),
        isNull(reminders.readAt),
      ),
    )
    .returning({ id: reminders.id });
  return rows.length;
}

/**
 * Snooze thirty minutes (SNOOZE_MINUTES): move `fireAt`, clear `deliveredAt`,
 * and the row leaves the centre until the tick delivers it again — the dedupe
 * window in the engine is wider than the snooze precisely so the re-fire does
 * not spawn a second row.
 */
export async function snooze(profileId: string, id: string): Promise<string | null> {
  const until = new Date(Date.now() + SNOOZE_MINUTES * 60 * 1000);
  const rows = await db.orm
    .update(reminders)
    .set({ fireAt: until, deliveredAt: null, snoozedUntil: until })
    .where(and(eq(reminders.id, id), eq(reminders.userId, profileId)))
    .returning({ id: reminders.id });
  return rows.length > 0 ? until.toISOString() : null;
}

/** The settings page forecast: same gather as the tick, future slots only. */
export async function firePreview(profileId: string, now = new Date()): Promise<NextFire[]> {
  return nextFires(await gather(profileId, now));
}

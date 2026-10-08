/**
 * Reminders (P18, PRD §28): what the scheduler will say and when — pure rules
 * over snapshots, like the planner beside them (ADR-021: the risky code is the
 * rules engine, cheap to test without a database).
 *
 * Every decision that could annoy a student lives here as an explicit
 * constant or branch: which types exist, at what local hour each daily nudge
 * speaks, how quiet hours hold a slot until the window ends, how late a missed
 * slot may still be delivered (catch-up — ADR-017: the machine was off, so the
 * scheduler catches up on start instead of queueing a backlog), and how close
 * two rows must be to count as the same moment (dedupe, which also makes a
 * snooze non-duplicating). The server only gathers snapshots, applies the
 * plan this returns, and delivers rows whose time has come — no timing logic
 * outside this file, so "the OS notification at the right time" is a test.
 *
 * Copy is composed here at slot time and frozen into the row: the centre is a
 * history of what was said, not a recomputation of what is true now (ADR-016's
 * exception — a delivered nudge must not rewrite itself when the task is
 * renamed or completed after the fact).
 */
import { localDate, type TaskSnapshot } from "../planning/index.ts";
import { dueLabel } from "../tasks/index.ts";

/* --- vocabulary ----------------------------------------------------------- */

export const REMINDER_TYPES = [
  "deadline",
  "session",
  "quest",
  "revision",
  "streak",
  "unfinished",
  "digest",
] as const;

export type ReminderType = (typeof REMINDER_TYPES)[number];

/** Settings and bell labels — one map so a type can never lack a name. */
export const REMINDER_LABELS: Record<ReminderType, string> = {
  deadline: "Deadlines",
  session: "Planned sessions",
  quest: "Quests",
  revision: "Revision due",
  streak: "Streak at risk",
  unfinished: "Unfinished work",
  digest: "Weekly digest",
};

export interface ReminderSettings {
  /** A missing key means on: a fresh account nudges, opting out is explicit. */
  enabled: Partial<Record<ReminderType, boolean>>;
  /** "HH:MM", local time. The window may wrap midnight (22:00–07:00). */
  quietStart: string;
  quietEnd: string;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: {},
  quietStart: "22:00",
  quietEnd: "07:00",
};

/** The single definition of "this type is on". */
export function typeEnabled(settings: ReminderSettings, type: ReminderType): boolean {
  return settings.enabled[type] ?? true;
}

/* --- timing --------------------------------------------------------------- */

/** Thirty minutes is long enough to finish what you are doing, short enough to matter. */
export const SNOOZE_MINUTES = 30;

/** A slot older than this when the scheduler looks is dropped, not delivered late. */
export const CATCHUP_HOURS = 4;

/** How far ahead rows are materialised — text stays fresh because it is short-lived. */
export const SYNC_HORIZON_HOURS = 26;

/** Two rows within this of the same moment are the same event (snooze moves fireAt). */
export const DEDUPE_HOURS = 12;

/** The settings page forecasts this far ahead. */
export const PREVIEW_DAYS = 7;

/** Delivered rows older than this are pruned from the centre. */
export const HISTORY_DAYS = 30;

/** A long assignment list pings for the nearest few, not all of them. */
export const MAX_DEADLINE_TASKS = 3;

/** Local wall-clock hours — nudges speak the student's day, not UTC's. */
export const REMINDER_HOURS = {
  session: 16,
  revision: 17,
  questDayBefore: 18,
  questDue: 18,
  unfinished: 20,
  streak: 21,
  digest: 9,
} as const;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function midnight(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function atHour(d: Date, hour: number): Date {
  const out = midnight(d);
  out.setHours(hour, 0, 0, 0);
  return out;
}

function parseTime(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Inside [start, end)? The window may wrap midnight. */
export function isQuiet(d: Date, start: string, end: string): boolean {
  const s = parseTime(start);
  const e = parseTime(end);
  if (s === null || e === null || s === e) return false;
  const mins = d.getHours() * 60 + d.getMinutes();
  return s < e ? mins >= s && mins < e : mins >= s || mins < e;
}

/** Hold a slot that lands in quiet hours until the window ends (§28: the student decides when). */
export function shiftQuiet(slot: Date, settings: ReminderSettings): Date {
  if (!isQuiet(slot, settings.quietStart, settings.quietEnd)) return slot;
  const end = parseTime(settings.quietEnd);
  if (end === null) return slot;
  const out = midnight(slot);
  out.setHours(Math.floor(end / 60), end % 60, 0, 0);
  if (out.getTime() <= slot.getTime()) out.setDate(out.getDate() + 1);
  return out;
}

/** "Today/Tomorrow/Yesterday" lowercase into a sentence; dates stay as they are. */
function dayWord(word: string): string {
  if (word === "Today" || word === "Tomorrow" || word === "Yesterday") return word.toLowerCase();
  return word;
}

const plural = (n: number) => (n === 1 ? "" : "s");

/* --- inputs --------------------------------------------------------------- */

export interface PlanSummary {
  id: string;
  /** The localDate key the plan belongs to. */
  date: string;
  pending: number;
  /** Dismissed blocks do not count against the student. */
  total: number;
}

export interface QuestSummary {
  id: string;
  title: string;
  dueAt: string | null;
  active: boolean;
}

export interface StreakSummary {
  current: number;
  lastActiveDate: string | null;
}

export interface DigestStats {
  weekMinutes: number;
}

export interface ReminderInput {
  now: Date;
  settings: ReminderSettings;
  tasks: TaskSnapshot[];
  plan: PlanSummary | null;
  quests: QuestSummary[];
  dueCardCount: number;
  streak: StreakSummary;
  /** null when nothing has been studied this week — the digest's own first-run gate. */
  digest: DigestStats | null;
}

export interface ReminderCandidate {
  type: ReminderType;
  refType: string | null;
  refId: string | null;
  /** Quiet-shifted slot in ISO — the moment the row may speak. */
  fireAt: string;
  title: string;
  body: string;
  href: string;
}

export interface ExistingReminder {
  id: string;
  type: ReminderType;
  refType: string | null;
  refId: string | null;
  fireAt: string;
  deliveredAt: string | null;
}

/* --- the rules ------------------------------------------------------------ */

interface Raw {
  slot: Date;
  type: ReminderType;
  refType: string | null;
  refId: string | null;
  title: string;
  body: string;
  href: string;
}

/**
 * Every slot the account could speak, unfiltered. Windows (horizon, catch-up),
 * quiet hours and dedupe are applied by the callers — sync wants all of them,
 * the settings preview wants a future horizon only, and both must agree on the
 * copy, which is why one function produces both.
 */
function rawsFor(input: ReminderInput): Raw[] {
  const out: Raw[] = [];
  const { now } = input;

  /* Deadlines — PRD §28's "upcoming deadlines", at T-1 day and T-1 hour.
     Overdue tasks are deliberately absent: a late "due tomorrow" is false, and
     the overdue fact already lives on the Home card (P17). */
  const upcoming = input.tasks
    .filter((t) => t.dueAt !== null && Date.parse(t.dueAt) > now.getTime())
    .sort((a, b) => Date.parse(a.dueAt as string) - Date.parse(b.dueAt as string))
    .slice(0, MAX_DEADLINE_TASKS);
  for (const task of upcoming) {
    const due = new Date(Date.parse(task.dueAt as string));
    const href = task.subjectId ? `/tasks?subject=${task.subjectId}` : "/tasks";
    out.push({
      slot: new Date(due.getTime() - DAY_MS),
      type: "deadline",
      refType: "task",
      refId: task.id,
      title: "Deadline tomorrow",
      body: `Your ${task.title} is due ${dayWord(dueLabel(due, new Date(due.getTime() - DAY_MS)))}.`,
      href,
    });
    out.push({
      slot: new Date(due.getTime() - HOUR_MS),
      type: "deadline",
      refType: "task",
      refId: task.id,
      title: "Deadline soon",
      body: `Your ${task.title} is due in an hour.`,
      href,
    });
  }

  /* Planned session — the day's first block waiting at a sane study hour. */
  if (input.plan && input.plan.pending > 0) {
    out.push({
      slot: atHour(now, REMINDER_HOURS.session),
      type: "session",
      refType: "plan",
      refId: input.plan.id,
      title: "Planned session",
      body: `Today's plan has ${input.plan.pending} item${plural(input.plan.pending)} — start when you can.`,
      href: "/plan",
    });

    /* Unfinished work — the same plan, later in the evening, still not done. */
    out.push({
      slot: atHour(now, REMINDER_HOURS.unfinished),
      type: "unfinished",
      refType: "plan",
      refId: input.plan.id,
      title: "Unfinished work",
      body: `${input.plan.pending} item${plural(input.plan.pending)} left in today's plan.`,
      href: "/plan",
    });
  }

  /* Quests — due the next day, then on the day itself. */
  for (const quest of input.quests) {
    if (!quest.active || !quest.dueAt) continue;
    const due = new Date(Date.parse(quest.dueAt));
    if (due.getTime() <= now.getTime()) continue;
    const dueMidnight = midnight(due);
    const href = `/quests?quest=${quest.id}`;
    out.push({
      slot: new Date(dueMidnight.getTime() - 6 * HOUR_MS),
      type: "quest",
      refType: "quest",
      refId: quest.id,
      title: "Quest due tomorrow",
      body: `“${quest.title}” is due tomorrow.`,
      href,
    });
    out.push({
      slot: new Date(dueMidnight.getTime() + REMINDER_HOURS.questDue * HOUR_MS),
      type: "quest",
      refType: "quest",
      refId: quest.id,
      title: "Quest due today",
      body: `“${quest.title}” is due today.`,
      href,
    });
  }

  /* Revision — a deck with cards waiting, every evening at the review hour. */
  if (input.dueCardCount > 0) {
    out.push({
      slot: atHour(now, REMINDER_HOURS.revision),
      type: "revision",
      refType: "review",
      refId: null,
      title: "Revision due",
      body: `${input.dueCardCount} flashcard${plural(input.dueCardCount)} due for review.`,
      href: "/study",
    });
  }

  /* Streak at risk — the day is ending and it has not been studied. */
  if (input.streak.current >= 1 && input.streak.lastActiveDate !== localDate(now)) {
    out.push({
      slot: atHour(now, REMINDER_HOURS.streak),
      type: "streak",
      refType: "streak",
      refId: null,
      title: "Streak at risk",
      body: `Your ${input.streak.current}-day streak ends today — one session keeps it.`,
      href: "/sessions",
    });
  }

  /* Weekly digest — Monday morning over last week's total, generated once the
     week is closed (Sunday), so the numbers cannot drift before they are read. */
  if (input.digest && input.digest.weekMinutes > 0) {
    let day = midnight(now);
    while (day.getDay() !== 1) day.setDate(day.getDate() + 1);
    let slot = atHour(day, REMINDER_HOURS.digest);
    if (slot.getTime() < now.getTime()) {
      day = atHour(day, REMINDER_HOURS.digest);
      day.setDate(day.getDate() + 7);
      slot = day;
    }
    out.push({
      slot,
      type: "digest",
      refType: "digest",
      refId: null,
      title: "Weekly digest",
      body: `Last week you studied ${input.digest.weekMinutes} minute${plural(input.digest.weekMinutes)}.`,
      href: "/progress",
    });
  }

  return out;
}

/** Is the source of an existing pending row still worth saying? */
function stillValid(row: ExistingReminder, input: ReminderInput): boolean {
  const now = input.now.getTime();
  switch (row.type) {
    case "deadline": {
      const task = input.tasks.find((t) => t.id === row.refId);
      return Boolean(task?.dueAt) && Date.parse(task?.dueAt as string) > now;
    }
    case "session":
    case "unfinished":
      return Boolean(input.plan) && input.plan?.id === row.refId && input.plan.pending > 0;
    case "quest": {
      const quest = input.quests.find((q) => q.id === row.refId);
      if (!quest?.active || !quest.dueAt) return false;
      return Date.parse(quest.dueAt) > now;
    }
    case "revision":
      return input.dueCardCount > 0;
    case "streak":
      return input.streak.current >= 1 && input.streak.lastActiveDate !== localDate(input.now);
    case "digest":
      // Validity was decided when the row was born (a week with minutes in it).
      // Re-asking here would drop Monday's row at 00:00 — the new week has no
      // minutes yet, which says nothing about last week's. Catch-up removes the
      // row if its Monday passes undelivered.
      return true;
  }
}

export interface ReminderSyncPlan {
  create: ReminderCandidate[];
  /** Pending rows to delete: past the catch-up window, switched off, or their event is gone. */
  dropIds: string[];
}

/**
 * The whole scheduler decision in one pure function: which rows to insert and
 * which pending rows to remove. Delivered rows are history and never dropped
 * here (the server prunes them by age). Dedupe runs against *every* existing
 * row — delivered or pending — so a slot cannot re-fire after a snooze moved
 * its `fireAt` by minutes rather than the 12 hours that separate events.
 */
export function reminderSyncPlan(
  input: ReminderInput,
  existing: ExistingReminder[],
): ReminderSyncPlan {
  const now = input.now.getTime();
  const dropIds: string[] = [];

  for (const row of existing) {
    if (row.deliveredAt !== null) continue;
    if (!typeEnabled(input.settings, row.type)) {
      dropIds.push(row.id);
      continue;
    }
    if (Date.parse(row.fireAt) < now - CATCHUP_HOURS * HOUR_MS) {
      dropIds.push(row.id);
      continue;
    }
    if (!stillValid(row, input)) dropIds.push(row.id);
  }

  const create: ReminderCandidate[] = [];
  for (const raw of rawsFor(input)) {
    if (!typeEnabled(input.settings, raw.type)) continue;
    const fireAt = shiftQuiet(raw.slot, input.settings);
    const t = fireAt.getTime();
    if (t > now + SYNC_HORIZON_HOURS * HOUR_MS) continue;
    if (t < now - CATCHUP_HOURS * HOUR_MS) continue;
    const dupe = existing.some(
      (row) =>
        row.type === raw.type &&
        row.refId === raw.refId &&
        Math.abs(Date.parse(row.fireAt) - t) < DEDUPE_HOURS * HOUR_MS,
    );
    if (dupe) continue;
    create.push({
      type: raw.type,
      refType: raw.refType,
      refId: raw.refId,
      fireAt: fireAt.toISOString(),
      title: raw.title,
      body: raw.body,
      href: raw.href,
    });
  }

  return { create, dropIds };
}

export interface NextFire {
  type: ReminderType;
  fireAt: string;
}

/**
 * The settings page's "next fire times": the earliest future occurrence of each
 * enabled type within the preview horizon — the same slots the sync would
 * create, so the forecast can never disagree with the delivery.
 */
export function nextFires(input: ReminderInput): NextFire[] {
  const now = input.now.getTime();
  const best = new Map<ReminderType, number>();
  for (const raw of rawsFor(input)) {
    if (!typeEnabled(input.settings, raw.type)) continue;
    const t = shiftQuiet(raw.slot, input.settings).getTime();
    if (t < now || t > now + PREVIEW_DAYS * DAY_MS) continue;
    const prev = best.get(raw.type);
    if (prev === undefined || t < prev) best.set(raw.type, t);
  }
  const out: NextFire[] = [];
  for (const type of REMINDER_TYPES) {
    const t = best.get(type);
    if (t !== undefined) out.push({ type, fireAt: new Date(t).toISOString() });
  }
  return out;
}

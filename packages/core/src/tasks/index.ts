/**
 * Task recurrence (rrule-lite) and the view/sort helpers the task list runs on
 * (P11, PRD sections 15–16, ADR-017).
 *
 * The rule is deliberately small: daily, weekly (by weekday), monthly, each with an
 * interval and an optional end date — the patterns students actually use, not the RRULE
 * standard. Occurrence math is calendar arithmetic on local dates at the anchor's
 * time-of-day, so "every Monday at 18:00" stays at 18:00 across DST.
 *
 * Materialisation reads these helpers and writes real rows; nothing here touches a
 * database, so the whole schedule is testable in isolation (ADR-017, ADR-021).
 */

/* --- vocabulary (PRD section 15) ----------------------------------------- */

export const TASK_KINDS = [
  "homework",
  "assignment",
  "revision",
  "project",
  "personal",
  "goal",
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type TaskStatus = "open" | "done" | "skipped";

/** Occurrences are materialised this many days ahead, counting today as day 0. */
export const MATERIALISE_DAYS = 14;

/* --- the rule ------------------------------------------------------------- */

export type TaskFreq = "daily" | "weekly" | "monthly";

export interface RecurrenceRule {
  freq: TaskFreq;
  /** Every `interval` days / weeks / months. */
  interval: number;
  /** Weekdays for `freq: "weekly"`, as 0 (Sunday) … 6 (Saturday), comma-separated. */
  byWeekday: string;
  /** ISO instant after which the series stops. */
  untilAt: string | null;
}

const DAY_MS = 86_400_000;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** `"5,1,1"` → `[1, 5]` — sorted, unique, out-of-range input dropped. */
export function parseWeekdays(byWeekday: string): number[] {
  if (byWeekday.trim() === "") return [];
  const days = new Set<number>();
  for (const part of byWeekday.split(",")) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n >= 0 && n <= 6) days.add(n);
  }
  return [...days].sort((a, b) => a - b);
}

/** A short label for a rule chip: "Every day", "Mon, Wed, Fri", "Every 2 weeks". */
export function ruleLabel(rule: RecurrenceRule): string {
  const every = (unit: string) => `Every ${rule.interval === 1 ? "" : `${rule.interval} `}${unit}`;
  switch (rule.freq) {
    case "daily":
      return every(rule.interval === 1 ? "day" : "days");
    case "monthly":
      return every(rule.interval === 1 ? "month" : "months");
    case "weekly": {
      const labels = parseWeekdays(rule.byWeekday)
        .map((d) => WEEKDAY_LABELS[d])
        .join(", ");
      if (labels && rule.interval === 1) return labels;
      if (labels) return `${labels} · ${every("weeks")}`;
      return every(rule.interval === 1 ? "week" : "weeks");
    }
  }
}

/* --- date helpers --------------------------------------------------------- */

function atAnchorTime(anchor: Date, y: number, m: number, day: number): Date {
  return new Date(
    y,
    m,
    day,
    anchor.getHours(),
    anchor.getMinutes(),
    anchor.getSeconds(),
    anchor.getMilliseconds(),
  );
}

/** Local midnight of `d`. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Local midnight of the day after `d`. */
export function startOfNextDay(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
}

/** The Sunday that starts `d`'s week (local). */
function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - day.getDay());
}

/**
 * Every instant the rule fires on in `[from, to]` (inclusive both ends), in order —
 * always strictly after the anchor, so the anchor (which is already the series' first
 * row) is never generated again.
 *
 * The anchor contributes its time-of-day to every occurrence; the interval steps whole
 * calendar days / weeks / months from the anchor's own day, so an "every 2 weeks" series
 * never drifts and a monthly rule clamps 31 January → 28 February instead of skipping.
 * Weekly intervals count whole weeks from the anchor's own week, so the phase of an
 * every-other-week series is set once, at creation.
 */
export function occurrencesBetween(
  anchor: Date,
  rule: RecurrenceRule,
  from: Date,
  to: Date,
  max = 120,
): Date[] {
  if (to.getTime() < from.getTime()) return [];
  const interval = Math.max(1, Math.floor(rule.interval) || 1);
  const until = rule.untilAt ? new Date(rule.untilAt) : null;
  const out: Date[] = [];

  const push = (cand: Date): "ok" | "stop" => {
    if (cand.getTime() > to.getTime()) return "stop";
    if (until && cand.getTime() > until.getTime()) return "stop";
    if (cand.getTime() >= from.getTime()) out.push(cand);
    return out.length >= max ? "stop" : "ok";
  };

  if (rule.freq === "daily") {
    for (let k = 1; out.length < max; k += 1) {
      const base = atAnchorTime(
        anchor,
        anchor.getFullYear(),
        anchor.getMonth(),
        anchor.getDate() + k * interval,
      );
      if (push(base) === "stop") break;
    }
    return out;
  }

  if (rule.freq === "monthly") {
    for (let k = 1; out.length < max; k += 1) {
      const totalMonths = anchor.getFullYear() * 12 + anchor.getMonth() + k * interval;
      const y = Math.floor(totalMonths / 12);
      const m = totalMonths - y * 12;
      // Clamp instead of skipping: a 31 Jan series still visits February.
      const lastDay = new Date(y, m + 1, 0).getDate();
      const base = atAnchorTime(anchor, y, m, Math.min(anchor.getDate(), lastDay));
      if (push(base) === "stop") break;
    }
    return out;
  }

  // weekly
  const weekdays = parseWeekdays(rule.byWeekday);
  const days = weekdays.length > 0 ? weekdays : [anchor.getDay()];
  const week0 = startOfWeek(anchor).getTime();
  const weekMs = 7 * DAY_MS;
  for (let w = 0; w < 520; w += 1) {
    if (w % interval !== 0) continue;
    const weekStart = new Date(week0 + w * weekMs);
    let stopped = false;
    for (const dow of days) {
      const cand = atAnchorTime(
        anchor,
        weekStart.getFullYear(),
        weekStart.getMonth(),
        weekStart.getDate() + dow,
      );
      if (cand.getTime() <= anchor.getTime()) continue; // the anchor itself and before
      if (push(cand) === "stop") {
        stopped = true;
        break;
      }
      if (cand.getTime() > to.getTime()) {
        stopped = true;
        break;
      }
    }
    if (stopped || out.length >= max) break;
    // Stop once the whole week starts past the window.
    if (week0 + (w + 1) * weekMs > to.getTime()) break;
  }
  return out;
}

/** The first instant strictly after `after` that the rule fires on, or null if the series has ended. */
export function nextOccurrence(anchor: Date, rule: RecurrenceRule, after: Date): Date | null {
  const searchTo = new Date(Math.max(after.getTime(), anchor.getTime()) + 400 * DAY_MS);
  const list = occurrencesBetween(anchor, rule, new Date(after.getTime() + 1), searchTo, 1);
  return list[0] ?? null;
}

/* --- views, overdue, sorting ---------------------------------------------- */

export type TaskView = "today" | "upcoming" | "all" | "done";

/**
 * Which view an open task lands in. Overdue tasks belong to Today: today is where the
 * work (and the chance to reschedule it) actually is. Completed and skipped rows share
 * the Done view — skipped carries its own chip and undoes back to open.
 */
export function taskView(dueAt: Date | string | null, status: TaskStatus, now: Date): TaskView {
  if (status !== "open") return "done";
  if (!dueAt) return "all";
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  return due.getTime() < startOfNextDay(now).getTime() ? "today" : "upcoming";
}

/**
 * Overdue means a previous calendar day's deadline was missed — not "five minutes past",
 * which would nag over an ordinary working afternoon.
 */
export function isOverdue(dueAt: Date | string | null, status: TaskStatus, now: Date): boolean {
  if (status !== "open" || !dueAt) return false;
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  return due.getTime() < startOfDay(now).getTime();
}

export type SortBy = "deadline" | "priority" | "estimate";

/** Sort weight: high first (0), unknown treated as normal (1), low last (2). */
export function priorityRank(priority: string): number {
  if (priority === "high") return 0;
  if (priority === "low") return 2;
  return 1;
}

interface Sortable {
  dueAt: Date | string | null;
  priority: string;
  estimateMin: number;
}

function dueTime(t: Sortable): number {
  if (!t.dueAt) return Number.MAX_SAFE_INTEGER;
  return (typeof t.dueAt === "string" ? new Date(t.dueAt) : t.dueAt).getTime();
}

/** Deadline: earliest first, undated last. Priority: high first. Estimate: smallest first, unsized last. */
export function sortTasks<T extends Sortable>(items: T[], by: SortBy): T[] {
  const sorted = [...items];
  if (by === "deadline") {
    sorted.sort((a, b) => dueTime(a) - dueTime(b));
  } else if (by === "priority") {
    sorted.sort(
      (a, b) => priorityRank(a.priority) - priorityRank(b.priority) || dueTime(a) - dueTime(b),
    );
  } else {
    const size = (t: Sortable): number =>
      t.estimateMin > 0 ? t.estimateMin : Number.MAX_SAFE_INTEGER;
    sorted.sort((a, b) => size(a) - size(b) || dueTime(a) - dueTime(b));
  }
  return sorted;
}

/** Human due label for a row: "Today", "Tomorrow", "Yesterday", "Fri", "5 Nov". */
export function dueLabel(dueAt: Date | string | null, now: Date): string {
  if (!dueAt) return "No date";
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const day = startOfDay(due).getTime();
  const today = startOfDay(now).getTime();
  const tomorrow = today + DAY_MS;
  const yesterday = today - DAY_MS;
  if (day === today) return "Today";
  if (day === tomorrow) return "Tomorrow";
  if (day === yesterday) return "Yesterday";
  const withinWeek = day > yesterday && day < today + 7 * DAY_MS;
  if (withinWeek) return WEEKDAY_LABELS[due.getDay()] ?? "";
  const month = MONTH_LABELS[due.getMonth()] ?? "";
  return `${due.getDate()} ${month}`;
}

import { describe, expect, it } from "vitest";

import {
  dueLabel,
  isOverdue,
  MATERIALISE_DAYS,
  nextOccurrence,
  occurrencesBetween,
  parseWeekdays,
  priorityRank,
  ruleLabel,
  sortTasks,
  startOfDay,
  startOfNextDay,
  taskView,
  type RecurrenceRule,
} from "./index.ts";

/** A Wednesday, 18:00 local — 7 October 2026 is a Wednesday. */
const WED_1800 = new Date(2026, 9, 7, 18, 0, 0, 0);
const day = (y: number, m: number, d: number) => new Date(y, m, d, 18, 0, 0, 0);
const days = (list: Date[]) => list.map((d) => [d.getFullYear(), d.getMonth(), d.getDate()]);

const weekly = (
  byWeekday: string,
  interval = 1,
  untilAt: string | null = null,
): RecurrenceRule => ({
  freq: "weekly",
  interval,
  byWeekday,
  untilAt,
});

describe("parseWeekdays", () => {
  it("sorts, deduplicates and drops garbage", () => {
    expect(parseWeekdays("5,1,1,9,x")).toEqual([1, 5]);
  });

  it("parses a full week", () => {
    expect(parseWeekdays("1,3,5")).toEqual([1, 3, 5]);
  });

  it("reads empty as no preference", () => {
    expect(parseWeekdays("")).toEqual([]);
  });
});

describe("ruleLabel", () => {
  it("names day counts", () => {
    expect(ruleLabel({ freq: "daily", interval: 1, byWeekday: "", untilAt: null })).toBe(
      "Every day",
    );
    expect(ruleLabel({ freq: "daily", interval: 3, byWeekday: "", untilAt: null })).toBe(
      "Every 3 days",
    );
  });

  it("names weekdays for a weekly rule", () => {
    expect(ruleLabel(weekly("1,3,5"))).toBe("Mon, Wed, Fri");
    expect(ruleLabel(weekly("0"))).toBe("Sun");
  });

  it("adds the interval to a weekly rule", () => {
    expect(ruleLabel(weekly("1,3,5", 2))).toBe("Mon, Wed, Fri · Every 2 weeks");
    expect(ruleLabel(weekly("", 2))).toBe("Every 2 weeks");
    expect(ruleLabel(weekly(""))).toBe("Every week");
  });

  it("names months", () => {
    expect(ruleLabel({ freq: "monthly", interval: 1, byWeekday: "", untilAt: null })).toBe(
      "Every month",
    );
    expect(ruleLabel({ freq: "monthly", interval: 2, byWeekday: "", untilAt: null })).toBe(
      "Every 2 months",
    );
  });
});

describe("occurrencesBetween — daily", () => {
  const rule: RecurrenceRule = { freq: "daily", interval: 1, byWeekday: "", untilAt: null };

  it("fires on consecutive days at the anchor's time, starting the day after the anchor", () => {
    const got = occurrencesBetween(WED_1800, rule, WED_1800, day(2026, 9, 10));
    expect(days(got)).toEqual([
      [2026, 9, 8],
      [2026, 9, 9],
      [2026, 9, 10],
    ]);
    expect(got[0]?.getHours()).toBe(18);
  });

  it("steps by the interval", () => {
    const every3 = { ...rule, interval: 3 };
    const got = occurrencesBetween(WED_1800, every3, WED_1800, day(2026, 9, 20));
    expect(days(got)).toEqual([
      [2026, 9, 10],
      [2026, 9, 13],
      [2026, 9, 16],
      [2026, 9, 19],
    ]);
  });

  it("respects an inclusive window on both ends", () => {
    const got = occurrencesBetween(WED_1800, rule, day(2026, 9, 9), day(2026, 9, 10));
    expect(days(got)).toEqual([
      [2026, 9, 9],
      [2026, 9, 10],
    ]);
  });

  it("stops at the until date", () => {
    const until = new Date(2026, 9, 9, 18).toISOString();
    const got = occurrencesBetween(
      WED_1800,
      { ...rule, untilAt: until },
      WED_1800,
      day(2026, 9, 30),
    );
    expect(days(got)).toEqual([
      [2026, 9, 8],
      [2026, 9, 9],
    ]);
  });
});

describe("occurrencesBetween — weekly", () => {
  it("fires only on the chosen weekdays, after the anchor", () => {
    // 7 Oct 2026 is a Wednesday; Mon/Wed/Fri from that week, anchor excluded.
    const got = occurrencesBetween(WED_1800, weekly("1,3,5"), WED_1800, day(2026, 9, 16));
    expect(days(got)).toEqual([
      [2026, 9, 9], // Fri
      [2026, 9, 12], // Mon
      [2026, 9, 14], // Wed
      [2026, 9, 16], // Fri
    ]);
  });

  it("steps weeks by the interval without drifting", () => {
    // On-weeks are counted from the anchor's week: week 0 (Mon 5 Oct, before the
    // anchor), week 2, week 4 … so the first Mondays are 19 Oct and 2 Nov.
    const got = occurrencesBetween(WED_1800, weekly("1", 2), WED_1800, day(2026, 10, 10));
    expect(days(got)).toEqual([
      [2026, 9, 19],
      [2026, 10, 2],
    ]);
  });

  it("returns nothing when the window is empty", () => {
    expect(occurrencesBetween(WED_1800, weekly("1"), day(2026, 9, 8), day(2026, 9, 8))).toEqual([]);
  });
});

describe("occurrencesBetween — monthly", () => {
  const rule: RecurrenceRule = { freq: "monthly", interval: 1, byWeekday: "", untilAt: null };

  it("clamps 31 January to February instead of skipping it", () => {
    const anchor = new Date(2026, 0, 31, 18);
    const got = occurrencesBetween(anchor, rule, anchor, day(2026, 3, 30));
    expect(days(got)).toEqual([
      [2026, 1, 28],
      [2026, 2, 31],
      [2026, 3, 30],
    ]);
  });

  it("steps months by the interval", () => {
    const anchor = new Date(2026, 9, 7, 18);
    const got = occurrencesBetween(anchor, { ...rule, interval: 2 }, anchor, day(2027, 3, 7));
    expect(days(got)).toEqual([
      [2026, 11, 7],
      [2027, 1, 7],
      [2027, 3, 7],
    ]);
  });
});

describe("nextOccurrence", () => {
  it("finds the day after the anchor for a daily rule", () => {
    const rule: RecurrenceRule = { freq: "daily", interval: 1, byWeekday: "", untilAt: null };
    expect(nextOccurrence(WED_1800, rule, WED_1800)).toEqual(day(2026, 9, 8));
  });

  it("finds the next matching weekday", () => {
    expect(nextOccurrence(WED_1800, weekly("0"), WED_1800)).toEqual(day(2026, 9, 11));
  });

  it("returns null once the until date has passed", () => {
    const until = new Date(2026, 9, 8, 12).toISOString();
    expect(nextOccurrence(WED_1800, weekly("3,4", 1, until), WED_1800)).toBeNull();
  });
});

describe("taskView and isOverdue", () => {
  const now = new Date(2026, 9, 7, 14, 30); // Wednesday afternoon

  it("routes done tasks to Done regardless of date", () => {
    expect(taskView(new Date(2026, 9, 1), "done", now)).toBe("done");
  });

  it("routes skipped occurrences to Done too, and never calls them overdue", () => {
    expect(taskView(new Date(2026, 9, 6, 9), "skipped", now)).toBe("done");
    expect(isOverdue(new Date(2026, 9, 6, 9), "skipped", now)).toBe(false);
  });

  it("puts overdue and due-today tasks in Today", () => {
    expect(taskView(new Date(2026, 9, 6, 9), "open", now)).toBe("today");
    expect(taskView(new Date(2026, 9, 7, 23), "open", now)).toBe("today");
  });

  it("puts tomorrow and later in Upcoming", () => {
    expect(taskView(new Date(2026, 9, 8, 0), "open", now)).toBe("upcoming");
  });

  it("puts undated tasks in All only", () => {
    expect(taskView(null, "open", now)).toBe("all");
  });

  it("counts only previous calendar days as overdue", () => {
    expect(isOverdue(new Date(2026, 9, 6, 23, 59), "open", now)).toBe(true);
    expect(isOverdue(new Date(2026, 9, 7, 0, 1), "open", now)).toBe(false); // earlier today
    expect(isOverdue(new Date(2026, 9, 6, 9), "done", now)).toBe(false);
    expect(isOverdue(null, "open", now)).toBe(false);
  });
});

describe("sortTasks", () => {
  const list = [
    { dueAt: null as Date | null, priority: "low", estimateMin: 0, id: "undated" },
    { dueAt: new Date(2026, 9, 9), priority: "normal", estimateMin: 60, id: "later" },
    { dueAt: new Date(2026, 9, 6), priority: "low", estimateMin: 15, id: "overdue" },
  ];

  it("deadline puts earliest first and undated last", () => {
    expect(sortTasks(list, "deadline").map((t) => t.id)).toEqual(["overdue", "later", "undated"]);
  });

  it("priority puts high first", () => {
    const withHigh = [{ dueAt: null, priority: "high", estimateMin: 0, id: "high" }, ...list];
    expect(sortTasks(withHigh, "priority").map((t) => t.id)[0]).toBe("high");
    expect(priorityRank("high")).toBe(0);
    expect(priorityRank("normal")).toBe(1);
    expect(priorityRank("low")).toBe(2);
  });

  it("estimate puts the smallest estimate first, unsized last", () => {
    expect(sortTasks(list, "estimate").map((t) => t.id)).toEqual(["overdue", "later", "undated"]);
  });

  it("does not mutate its input", () => {
    const before = list.map((t) => t.id);
    sortTasks(list, "deadline");
    expect(list.map((t) => t.id)).toEqual(before);
  });
});

describe("dueLabel", () => {
  const now = new Date(2026, 9, 7, 14, 30); // Wednesday

  it("names the near days", () => {
    expect(dueLabel(new Date(2026, 9, 7, 9), now)).toBe("Today");
    expect(dueLabel(new Date(2026, 9, 8, 9), now)).toBe("Tomorrow");
    expect(dueLabel(new Date(2026, 9, 6, 9), now)).toBe("Yesterday");
    expect(dueLabel(new Date(2026, 9, 9, 9), now)).toBe("Fri");
    expect(dueLabel(new Date(2026, 10, 2, 9), now)).toBe("2 Nov");
    expect(dueLabel(null, now)).toBe("No date");
  });
});

describe("day boundaries", () => {
  it("startOfDay and startOfNextDay bracket any instant", () => {
    const now = new Date(2026, 9, 7, 23, 59);
    expect(startOfDay(now).getTime()).toBeLessThanOrEqual(now.getTime());
    expect(startOfNextDay(now).getTime()).toBeGreaterThan(now.getTime());
    expect(startOfDay(now).getHours()).toBe(0);
  });

  it("the horizon counts today plus MATERIALISE_DAYS more", () => {
    const now = new Date(2026, 9, 7, 14, 30);
    const horizon = new Date(startOfDay(now).getTime() + MATERIALISE_DAYS * 86_400_000);
    expect(horizon.getDate()).toBe(7 + MATERIALISE_DAYS);
  });
});

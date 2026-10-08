import { describe, expect, it } from "vitest";

import type { TaskSnapshot } from "../planning/index.ts";
import {
  DEFAULT_REMINDER_SETTINGS,
  CATCHUP_HOURS,
  MAX_DEADLINE_TASKS,
  REMINDER_TYPES,
  isQuiet,
  nextFires,
  reminderSyncPlan,
  shiftQuiet,
  typeEnabled,
  type ExistingReminder,
  type ReminderInput,
  type ReminderSettings,
} from "./index.ts";

/* --- fixtures --------------------------------------------------------------- */

// Wednesday 7 October 2026, 09:00 local — the same "now" the planning tests use.
const now = new Date(2026, 9, 7, 9, 0, 0);
const iso = (month: number, day: number, hour = 0, minute = 0) =>
  new Date(2026, month, day, hour, minute).toISOString();

function task(over: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    id: "task-1",
    title: "Complete Physics Assignment",
    subjectId: "subject-1",
    topicId: "topic-1",
    kind: "assignment",
    priority: "normal",
    dueAt: iso(9, 8, 10), // tomorrow 10:00
    estimateMin: 45,
    ...over,
  };
}

function input(over: Partial<ReminderInput> = {}): ReminderInput {
  return {
    now,
    settings: DEFAULT_REMINDER_SETTINGS,
    tasks: [],
    plan: null,
    quests: [],
    dueCardCount: 0,
    streak: { current: 0, lastActiveDate: null },
    digest: null,
    ...over,
  };
}

const planOf = (pending: number) => ({ id: "plan-1", date: "2026-10-07", pending, total: pending });

const quest = (over: Partial<ReminderInput["quests"][number]> = {}) => ({
  id: "quest-1",
  title: "Master Reactions",
  dueAt: iso(9, 8, 23, 59), // tomorrow, end of day
  active: true,
  ...over,
});

const row = (over: Partial<ExistingReminder> = {}): ExistingReminder => ({
  id: "row-1",
  type: "streak",
  refType: null,
  refId: null,
  fireAt: iso(9, 7, 21),
  deliveredAt: null,
  ...over,
});

const creates = (i: ReminderInput) => reminderSyncPlan(i, []).create;
const of = (list: ReturnType<typeof creates>, type: string) => list.filter((c) => c.type === type);

/* --- first-run silence ------------------------------------------------------ */

describe("reminderSyncPlan — first-run", () => {
  it("says nothing and drops nothing on an empty account", () => {
    expect(reminderSyncPlan(input(), [])).toEqual({ create: [], dropIds: [] });
    expect(nextFires(input())).toEqual([]);
  });

  it("gates the loud types on real data", () => {
    const quiet = input({
      plan: planOf(0),
      quests: [quest({ dueAt: null })],
      streak: { current: 0, lastActiveDate: null },
      digest: null,
    });
    expect(creates(quiet)).toEqual([]);
  });
});

/* --- deadlines (§28: upcoming deadlines) ------------------------------------ */

describe("deadline rules", () => {
  it("fires T-1 day and T-1 hour with the day's own words", () => {
    const made = of(creates(input({ tasks: [task()] })), "deadline");
    expect(made).toHaveLength(2);

    const day = made.find((c) => c.title === "Deadline tomorrow");
    expect(day).toMatchObject({
      refType: "task",
      refId: "task-1",
      body: "Your Complete Physics Assignment is due tomorrow.",
      href: "/tasks?subject=subject-1",
      fireAt: iso(9, 7, 10), // due 8 Oct 10:00 minus 24h
    });

    const hour = made.find((c) => c.title === "Deadline soon");
    expect(hour?.body).toBe("Your Complete Physics Assignment is due in an hour.");
    expect(hour?.fireAt).toBe(iso(9, 8, 9));
  });

  it("skips undated, past-due and far-future tasks", () => {
    const far = creates(input({ tasks: [task({ dueAt: iso(9, 20, 12) })] }));
    expect(far).toEqual([]); // T-1 day is 12 days out, beyond the sync horizon
    const past = creates(input({ tasks: [task({ dueAt: iso(9, 6, 12) })] }));
    expect(past).toEqual([]);
    const undated = creates(input({ tasks: [task({ dueAt: null })] }));
    expect(undated).toEqual([]);
  });

  it(`pings for the ${MAX_DEADLINE_TASKS} nearest tasks only`, () => {
    const five = [
      task({ id: "t1", dueAt: iso(9, 8, 7, 0) }),
      task({ id: "t2", dueAt: iso(9, 8, 7, 30) }),
      task({ id: "t3", dueAt: iso(9, 8, 8, 0) }),
      task({ id: "t4", dueAt: iso(9, 8, 8, 30) }),
      task({ id: "t5", dueAt: iso(9, 8, 9, 0) }),
    ];
    const refs = new Set(of(creates(input({ tasks: five })), "deadline").map((c) => c.refId));
    expect(refs).toEqual(new Set(["t1", "t2", "t3"]));
  });

  it("drops a pending deadline row once the task is gone or overdue", () => {
    const pending = row({ type: "deadline", refType: "task", refId: "task-1" });
    const done = reminderSyncPlan(input({ tasks: [] }), [pending]);
    expect(done.dropIds).toEqual(["row-1"]);

    const overdue = reminderSyncPlan(input({ tasks: [task({ dueAt: iso(9, 6, 12) })] }), [pending]);
    expect(overdue.dropIds).toEqual(["row-1"]);
  });
});

/* --- today's plan (§28: planned sessions, unfinished tasks) ----------------- */

describe("plan rules", () => {
  it("names the afternoon slot and the evening catch-up", () => {
    const made = creates(input({ plan: planOf(3) }));
    expect(of(made, "session")).toEqual([
      expect.objectContaining({
        fireAt: iso(9, 7, 16),
        body: "Today's plan has 3 items — start when you can.",
        href: "/plan",
      }),
    ]);
    expect(of(made, "unfinished")).toEqual([
      expect.objectContaining({ fireAt: iso(9, 7, 20), body: "3 items left in today's plan." }),
    ]);
  });

  it("stays quiet with no plan or nothing pending, and drops rows when the plan is done", () => {
    expect(creates(input({ plan: planOf(0) }))).toEqual([]);
    const pending = row({ type: "unfinished", refType: "plan", refId: "plan-1" });
    const planDone = reminderSyncPlan(input({ plan: planOf(0) }), [pending]);
    expect(planDone.dropIds).toEqual(["row-1"]);
    const planGone = reminderSyncPlan(input({ plan: null }), [pending]);
    expect(planGone.dropIds).toEqual(["row-1"]);
  });
});

/* --- quests (§28: quests) --------------------------------------------------- */

describe("quest rules", () => {
  it("speaks the day before and the day of, into the quest deep link", () => {
    const made = of(creates(input({ quests: [quest()] })), "quest");
    expect(made).toEqual([
      expect.objectContaining({
        fireAt: iso(9, 7, 18), // day before, 18:00
        title: "Quest due tomorrow",
        body: "“Master Reactions” is due tomorrow.",
        href: "/quests?quest=quest-1",
      }),
    ]);

    const preview = nextFires(input({ quests: [quest()] }));
    const questFire = preview.find((f) => f.type === "quest");
    expect(questFire?.fireAt).toBe(iso(9, 7, 18)); // earliest of the two slots
  });

  it("ignores quests without a date and drops rows for finished quests", () => {
    expect(creates(input({ quests: [quest({ dueAt: null })] }))).toEqual([]);
    const pending = row({ type: "quest", refType: "quest", refId: "quest-1" });
    const finished = reminderSyncPlan(input({ quests: [quest({ active: false })] }), [pending]);
    expect(finished.dropIds).toEqual(["row-1"]);
  });
});

/* --- revision and streak (§28: revision, streaks) -------------------------- */

describe("revision and streak rules", () => {
  it("counts the deck that is waiting", () => {
    const made = creates(input({ dueCardCount: 5 }));
    expect(of(made, "revision")).toEqual([
      expect.objectContaining({
        fireAt: iso(9, 7, 17),
        body: "5 flashcards due for review.",
        href: "/study",
      }),
    ]);
    expect(creates(input({ dueCardCount: 0 }))).toEqual([]);

    const pending = row({ type: "revision" });
    expect(reminderSyncPlan(input({ dueCardCount: 0 }), [pending]).dropIds).toEqual(["row-1"]);
  });

  it("protects a streak only on a day that has not been studied", () => {
    const unstudied = input({ streak: { current: 5, lastActiveDate: "2026-10-06" } });
    expect(of(creates(unstudied), "streak")).toEqual([
      expect.objectContaining({
        fireAt: iso(9, 7, 21),
        body: "Your 5-day streak ends today — one session keeps it.",
        href: "/sessions",
      }),
    ]);

    const studied = input({ streak: { current: 5, lastActiveDate: "2026-10-07" } });
    expect(of(creates(studied), "streak")).toEqual([]);

    const pending = row({ type: "streak" });
    expect(reminderSyncPlan(studied, [pending]).dropIds).toEqual(["row-1"]);
    expect(
      reminderSyncPlan(input({ streak: { current: 0, lastActiveDate: null } }), [pending]).dropIds,
    ).toEqual(["row-1"]);
  });
});

/* --- weekly digest ----------------------------------------------------------- */

describe("weekly digest", () => {
  it("lands on Monday morning after a week that had study in it", () => {
    // Sunday 11 October, 10:00 — the week is closed, Monday's slot is tomorrow.
    const sunday = new Date(2026, 9, 11, 10, 0, 0);
    const made = of(
      creates(
        input({
          now: sunday,
          digest: { weekMinutes: 120 },
          streak: { current: 3, lastActiveDate: "2026-10-11" },
        }),
      ),
      "digest",
    );
    expect(made).toEqual([
      expect.objectContaining({
        fireAt: iso(9, 12, 9),
        body: "Last week you studied 120 minutes.",
        href: "/progress",
      }),
    ]);
  });

  it("needs study minutes, and appears in the forecast even days ahead", () => {
    expect(creates(input({ digest: null }))).toEqual([]);
    expect(creates(input({ digest: { weekMinutes: 0 } }))).toEqual([]);

    const forecast = nextFires(input({ digest: { weekMinutes: 45 } })).find(
      (f) => f.type === "digest",
    );
    expect(forecast?.fireAt).toBe(iso(9, 12, 9)); // next Monday from Wednesday
  });

  it("keeps Monday's pending row while the new week is still empty", () => {
    // Monday 07:00: last week had minutes (row exists), this week has none —
    // the row must survive to its 09:00 slot instead of being re-judged.
    const monday = new Date(2026, 9, 12, 7, 0, 0);
    const pending = row({ type: "digest", refType: "digest", fireAt: iso(9, 12, 9) });
    const plan = reminderSyncPlan(input({ now: monday, digest: null }), [pending]);
    expect(plan.dropIds).toEqual([]);
  });
});

/* --- quiet hours, catch-up, dedupe ------------------------------------------- */

describe("delivery policy", () => {
  it("holds a slot inside quiet hours until the window ends, wrapping midnight", () => {
    const quiet: ReminderSettings = { enabled: {}, quietStart: "21:00", quietEnd: "08:00" };
    const slot = new Date(2026, 9, 7, 21, 30);
    expect(isQuiet(slot, quiet.quietStart, quiet.quietEnd)).toBe(true);
    expect(isQuiet(new Date(2026, 9, 7, 8, 0), quiet.quietStart, quiet.quietEnd)).toBe(false);
    expect(shiftQuiet(slot, quiet).getTime()).toBe(new Date(2026, 9, 8, 8, 0).getTime());
    // Outside the window nothing moves.
    expect(shiftQuiet(new Date(2026, 9, 7, 12, 0), quiet).getTime()).toBe(
      new Date(2026, 9, 7, 12, 0).getTime(),
    );
  });

  it("delivers a slot that passed while the machine was off, within the window", () => {
    const evening = new Date(2026, 9, 7, 18, 0, 0); // session slot was 16:00
    const made = of(creates(input({ now: evening, plan: planOf(2) })), "session");
    expect(made).toHaveLength(1); // 2h late — inside the 4h catch-up

    const night = new Date(2026, 9, 7, 23, 0, 0);
    const missed = of(creates(input({ now: night, plan: planOf(2) })), "session");
    expect(missed).toEqual([]); // 7h late — the window has closed, no backlog
  });

  it("does not duplicate a slot the account already has (or snoozed past it)", () => {
    const existing = [
      row({ type: "revision", fireAt: iso(9, 7, 16, 30), deliveredAt: iso(9, 7, 16, 30) }),
    ];
    const plan = reminderSyncPlan(input({ dueCardCount: 5 }), existing);
    expect(of(plan.create, "revision")).toEqual([]); // same event, 30 minutes apart

    const other = reminderSyncPlan(input({ dueCardCount: 5 }), [
      row({ type: "revision", refId: "elsewhere", fireAt: iso(9, 7, 17) }),
    ]);
    expect(of(other.create, "revision")).toHaveLength(1); // different key (both null — same type… see below)

    const otherType = reminderSyncPlan(input({ tasks: [task()] }), [
      row({ type: "deadline", refType: "task", refId: "task-1", fireAt: iso(9, 7, 10) }),
    ]);
    expect(of(otherType.create, "deadline")).toHaveLength(1); // only the T-1 hour slot survives
  });

  it("drops rows of a type the student switched off", () => {
    const settings: ReminderSettings = { ...DEFAULT_REMINDER_SETTINGS, enabled: { streak: false } };
    const made = creates(input({ settings, streak: { current: 5, lastActiveDate: null } }));
    expect(typeEnabled(settings, "streak")).toBe(false);
    expect(of(made, "streak")).toEqual([]);

    const pending = row({ type: "streak" });
    const plan = reminderSyncPlan(
      input({ settings, streak: { current: 5, lastActiveDate: null } }),
      [pending],
    );
    expect(plan.dropIds).toEqual(["row-1"]);
  });

  it(`drops a pending row older than the ${CATCHUP_HOURS}h catch-up window`, () => {
    const stale = row({ type: "session", fireAt: iso(9, 6, 16), deliveredAt: null });
    const plan = reminderSyncPlan(input({ plan: planOf(3) }), [stale]);
    expect(plan.dropIds).toEqual(["row-1"]);
  });

  it("keeps delivered rows as history", () => {
    const delivered = row({ type: "session", fireAt: iso(9, 6, 16), deliveredAt: iso(9, 6, 16) });
    const plan = reminderSyncPlan(input({ plan: planOf(3) }), [delivered]);
    expect(plan.dropIds).toEqual([]);
  });
});

/* --- the settings forecast --------------------------------------------------- */

describe("nextFires", () => {
  it("lists the earliest future slot per enabled type, in catalogue order", () => {
    const forecast = nextFires(
      input({
        plan: planOf(2),
        tasks: [task()],
        streak: { current: 4, lastActiveDate: "2026-10-06" },
        settings: { ...DEFAULT_REMINDER_SETTINGS, enabled: { revision: false } },
        dueCardCount: 6,
      }),
    );
    expect(forecast.map((f) => f.type)).toEqual(
      [
        "deadline",
        "session",
        "revision", // …except this one is off:
        "streak",
        "unfinished",
      ].filter((t) => t !== "revision"),
    );

    expect(forecast.find((f) => f.type === "deadline")?.fireAt).toBe(iso(9, 7, 10));
    expect(forecast.find((f) => f.type === "session")?.fireAt).toBe(iso(9, 7, 16));
    expect(forecast.find((f) => f.type === "unfinished")?.fireAt).toBe(iso(9, 7, 20));
    expect(forecast.find((f) => f.type === "streak")?.fireAt).toBe(iso(9, 7, 21));
  });

  it("omits slots already behind us", () => {
    const evening = new Date(2026, 9, 7, 18, 0, 0);
    const forecast = nextFires(input({ now: evening, plan: planOf(2) }));
    expect(forecast.find((f) => f.type === "session")).toBeUndefined();
    expect(forecast.find((f) => f.type === "unfinished")?.fireAt).toBe(iso(9, 7, 20));
  });

  it("covers every type the catalogue defines", () => {
    expect(REMINDER_TYPES).toHaveLength(7);
    expect([...REMINDER_TYPES]).toEqual(
      expect.arrayContaining([
        "deadline",
        "session",
        "quest",
        "revision",
        "streak",
        "unfinished",
        "digest",
      ]),
    );
  });
});

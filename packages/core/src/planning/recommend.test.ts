import { describe, expect, it } from "vitest";

import type { TaskSnapshot, TopicSnapshot } from "./index.ts";
import {
  MAX_SUGGESTIONS,
  recommend,
  RECOMMENDATION_CODES,
  type AttemptSignal,
  type RecommendContext,
  type RecommendInput,
} from "./recommend.ts";

/* --- fixtures --------------------------------------------------------------- */

// Wednesday 7 October 2026 — the same "now" the planning tests live in.
const now = new Date(2026, 9, 7, 9, 0, 0);
const at = (day: number) => new Date(2026, 9, day).toISOString();
const on = (year: number, month: number, day: number) => new Date(year, month, day).toISOString();

function task(over: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    id: "task-1",
    title: "Complete Physics Assignment",
    subjectId: "subject-1",
    topicId: "topic-1",
    kind: "assignment",
    priority: "normal",
    dueAt: at(5), // Monday — two days overdue as of `now`
    estimateMin: 45,
    ...over,
  };
}

function topic(over: Partial<TopicSnapshot> = {}): TopicSnapshot {
  return {
    id: "topic-1",
    subjectId: "subject-1",
    name: "Motion",
    status: "learning",
    lastStudiedAt: null,
    mastery: 0.4,
    assets: { notes: 1, cards: 0, dueCards: 0, quizzes: 1 },
    ...over,
  };
}

function attempt(over: Partial<AttemptSignal> = {}): AttemptSignal {
  return { topicId: "topic-1", score: 5, total: 10, completedAt: at(6), ...over };
}

function input(over: Partial<RecommendInput> = {}): RecommendInput {
  return {
    now,
    tasks: [],
    topicsById: {},
    attempts: [],
    studiedToday: false,
    streak: 0,
    everStudied: false,
    quest: null,
    day: null,
    ...over,
  };
}

const codesOf = (list: ReturnType<typeof recommend>) => list.map((r) => r.code);
const find = (list: ReturnType<typeof recommend>, code: string) =>
  list.find((r) => r.code === code);

/* --- anti-spam: the quiet account ------------------------------------------- */

describe("recommend — first-run silence", () => {
  it("returns nothing for an empty account in either context", () => {
    const contexts: RecommendContext[] = ["home", "after"];
    for (const context of contexts) {
      expect(recommend(input(), context)).toEqual([]);
    }
  });

  it("keeps history-hungry rules silent until there is history", () => {
    // Cards exist, decks built, a plan waiting — but the student never studied.
    const full = input({
      everStudied: false,
      streak: 0,
      topicsById: {
        t1: topic({ assets: { notes: 1, cards: 6, dueCards: 3, quizzes: 1 } }),
      },
      day: { pending: 3, total: 5 },
    });
    expect(codesOf(recommend(full))).not.toContain("stale_review");
    expect(codesOf(recommend(full, "after"))).not.toContain("day_remainder");
  });
});

/* --- deadlines -------------------------------------------------------------- */

describe("recommend — deadlines", () => {
  it("names one overdue task with its day and links into the subject filter", () => {
    const [only] = recommend(input({ tasks: [task()] }));
    expect(only).toMatchObject({
      code: "overdue",
      text: "Your Complete Physics Assignment was due 5 Oct.",
      action: "Open tasks",
      href: "/tasks?subject=subject-1",
      score: 92, // 90 + 2 days overdue (Oct 5 -> Oct 7)
    });
  });

  it("bundles several overdue tasks into one line and drops the filter when undated", () => {
    const bundled = recommend(
      input({
        tasks: [
          task(),
          task({ id: "task-2", title: "Read chapter 4", dueAt: at(6) }),
          task({ id: "task-3", subjectId: null, dueAt: on(2026, 8, 20) }),
        ],
      }),
    );
    const overdue = find(bundled, "overdue");
    expect(overdue?.text).toBe("3 tasks are overdue — the oldest was due 20 Sep.");
    // The subject filter follows the *worst* task, which here has no subject.
    expect(overdue?.href).toBe("/tasks");
    expect(overdue?.score).toBe(90 + 7); // capped at a week's worth of urgency
  });

  it("separates due today from due tomorrow and skips the undated", () => {
    const tomorrow = recommend(input({ tasks: [task({ dueAt: at(8) })] }));
    expect(find(tomorrow, "due_soon")).toMatchObject({
      text: "Your Complete Physics Assignment is due tomorrow.",
      score: 72,
    });

    const both = recommend(
      input({
        tasks: [task({ dueAt: at(7) }), task({ id: "t2", dueAt: at(8), title: "Lab write-up" })],
      }),
    );
    expect(find(both, "due_soon")).toMatchObject({
      text: "2 tasks are due today or tomorrow.",
      score: 78,
    });

    expect(find(tomorrow, "due_soon")?.href).toBe("/tasks?subject=subject-1");
    // A task due Friday (two days out) is not "soon" and not overdue.
    expect(codesOf(recommend(input({ tasks: [task({ dueAt: at(9) })] })))).toEqual([]);
  });
});

/* --- weak scores ------------------------------------------------------------ */

describe("recommend — weak mastery", () => {
  it("quotes the latest weak attempt and links to the quiz tab (§27 example)", () => {
    const weak = recommend(input({ attempts: [attempt()], topicsById: { "topic-1": topic() } }));
    expect(find(weak, "weak_quiz")).toMatchObject({
      text: "You scored 5/10 on your last Motion quiz.",
      action: "Try a quick review",
      href: "/study/subject-1?tab=quizzes",
      score: 75, // 60 + (1 - 0.5) * 30
    });
  });

  it("stays silent for a passing score, an unknown topic, or an old attempt", () => {
    const pass = input({ attempts: [attempt({ score: 8 })], topicsById: { "topic-1": topic() } });
    expect(recommend(pass)).toEqual([]);

    const unknown = input({ attempts: [attempt({ topicId: "gone" })] });
    expect(recommend(unknown)).toEqual([]);

    // 17 days old — outside the 14-day window.
    const old = input({
      attempts: [attempt({ completedAt: on(2026, 8, 20) })],
      topicsById: { "topic-1": topic() },
    });
    expect(recommend(old)).toEqual([]);
  });

  it("picks the most recent weak attempt, not merely the lowest", () => {
    const weak = recommend(
      input({
        topicsById: {
          "topic-1": topic({ name: "Motion" }),
          "topic-2": topic({ id: "topic-2", name: "Waves" }),
        },
        attempts: [
          attempt({ topicId: "topic-2", score: 9, total: 10, completedAt: at(3) }),
          attempt({ topicId: "topic-2", score: 4, total: 10, completedAt: at(5) }),
          attempt({ topicId: "topic-1", score: 5, total: 10, completedAt: at(6) }),
        ],
      }),
    );
    // Waves' 9/10 is fine, its 4/10 is older than Motion's 5/10 — Motion wins.
    expect(find(weak, "weak_quiz")?.text).toContain("Motion");
  });
});

/* --- quiet topics ----------------------------------------------------------- */

describe("recommend — quiet topics", () => {
  it("names the stalest topic with cards, never a fresh one", () => {
    const stale = recommend(
      input({
        everStudied: true,
        topicsById: {
          fresh: topic({
            id: "fresh",
            name: "Heat",
            lastStudiedAt: at(5), // two days ago
            assets: { notes: 1, cards: 4, dueCards: 1, quizzes: 0 },
          }),
          quiet: topic({
            id: "quiet",
            name: "Electricity",
            lastStudiedAt: on(2026, 8, 30), // a week ago
            assets: { notes: 1, cards: 8, dueCards: 5, quizzes: 0 },
          }),
        },
      }),
    );
    expect(find(stale, "stale_review")).toMatchObject({
      text: "You haven't reviewed Electricity recently.",
      action: "Review cards",
      href: "/study/subject-1?tab=flashcards",
      score: 57, // 50 + 7 days
    });
  });

  it("uses 'yet' for a built deck that was never reviewed, and skips cardless topics", () => {
    const never = recommend(
      input({
        everStudied: true,
        topicsById: {
          "topic-1": topic({ assets: { notes: 2, cards: 6, dueCards: 2, quizzes: 1 } }),
        },
      }),
    );
    expect(find(never, "stale_review")?.text).toBe("You haven't reviewed Motion yet.");

    const cardless = recommend(
      input({
        everStudied: true,
        topicsById: {
          "topic-1": topic({ assets: { notes: 2, cards: 0, dueCards: 0, quizzes: 1 } }),
        },
      }),
    );
    expect(codesOf(cardless)).not.toContain("stale_review");
  });
});

/* --- forward-looking rules --------------------------------------------------- */

describe("recommend — next quiz, quest step, day remainder", () => {
  it("offers an untried quiz on the alphabetically first such topic", () => {
    const next = recommend(
      input({
        everStudied: true,
        topicsById: {
          b: topic({
            id: "b",
            name: "Waves",
            mastery: 0.9,
            assets: { notes: 0, cards: 0, dueCards: 0, quizzes: 2 },
          }),
          a: topic({
            id: "a",
            name: "Motion",
            mastery: null,
            assets: { notes: 0, cards: 0, dueCards: 0, quizzes: 1 },
          }),
          c: topic({
            id: "c",
            name: "Heat",
            mastery: null,
            assets: { notes: 0, cards: 0, dueCards: 0, quizzes: 0 },
          }),
        },
      }),
    );
    expect(find(next, "next_quiz")).toMatchObject({
      text: "Motion has a quiz you haven't tried.",
      action: "Take the quiz",
      href: "/study/subject-1?tab=quizzes",
      score: 57,
    });
  });

  it("names the waiting quest step and goes quiet once the quest is finished", () => {
    const running = recommend(
      input({
        quest: { title: "Master Motion", href: "/quests?quest=q1", stepDone: 1, stepTotal: 4 },
      }),
    );
    expect(find(running, "next_step")).toMatchObject({
      text: "Continue Master Motion — step 2 of 4.",
      href: "/quests?quest=q1",
      score: 65,
    });

    const done = recommend(
      input({ quest: { title: "Master Motion", href: "/quests", stepDone: 4, stepTotal: 4 } }),
    );
    expect(codesOf(done)).not.toContain("next_step");
  });

  it("counts today's remainder only after real study, and only in the after strip", () => {
    const day = { pending: 3, total: 5 };
    const home = recommend(input({ everStudied: true, day }));
    expect(codesOf(home)).not.toContain("day_remainder");

    const after = recommend(input({ everStudied: true, day }), "after");
    expect(find(after, "day_remainder")).toMatchObject({
      text: "3 items left in today's quest.",
      action: "Finish the day",
      href: "/plan",
      score: 43,
    });

    const empty = recommend(input({ everStudied: true, day: { pending: 0, total: 5 } }), "after");
    expect(codesOf(empty)).not.toContain("day_remainder");

    const singular = recommend(
      input({ everStudied: true, day: { pending: 1, total: 5 } }),
      "after",
    );
    expect(find(singular, "day_remainder")?.text).toBe("1 item left in today's quest.");
  });

  it("protects a live streak only when today is still unstudied", () => {
    const protect = recommend(input({ everStudied: true, streak: 5 }));
    expect(find(protect, "streak_keep")).toMatchObject({
      text: "You've studied 5 days in a row — keep it going.",
      action: "Start a session",
      href: "/sessions",
      score: 47, // 42 + 5
    });

    expect(
      codesOf(recommend(input({ everStudied: true, streak: 5, studiedToday: true }))),
    ).not.toContain("streak_keep");
    expect(codesOf(recommend(input({ everStudied: true, streak: 1 })))).not.toContain(
      "streak_keep",
    );
  });
});

/* --- ranking and contexts ---------------------------------------------------- */

describe("recommend — ranking contract", () => {
  it("caps at MAX_SUGGESTIONS, highest score first, ties by catalogue order", () => {
    // Everything that can fire at once: overdue (91), due today (78), weak (75).
    const ranked = recommend(
      input({
        everStudied: true,
        streak: 4,
        tasks: [task(), task({ id: "t2", title: "Lab write-up", dueAt: at(7) })],
        topicsById: {
          "topic-1": topic({
            assets: { notes: 1, cards: 7, dueCards: 2, quizzes: 1 },
            lastStudiedAt: on(2026, 8, 30),
          }),
        },
        attempts: [attempt()],
        quest: { title: "Master Motion", href: "/quests", stepDone: 1, stepTotal: 4 },
        day: { pending: 2, total: 4 },
      }),
    );
    expect(ranked).toHaveLength(MAX_SUGGESTIONS);
    expect(ranked.map((r) => r.score)).toEqual([92, 78, 75]);
  });

  it("breaks score ties by catalogue order (stale_review before next_quiz)", () => {
    const tied = recommend(
      input({
        everStudied: true,
        topicsById: {
          "topic-1": topic({
            lastStudiedAt: on(2026, 8, 30), // exactly a week — 50 + 7 = 57
            assets: { notes: 1, cards: 5, dueCards: 1, quizzes: 1 },
            mastery: null, // also an untried quiz — 57
          }),
        },
      }),
    );
    expect(codesOf(tied)).toEqual(["stale_review", "next_quiz"]);
    expect(RECOMMENDATION_CODES.indexOf("stale_review")).toBeLessThan(
      RECOMMENDATION_CODES.indexOf("next_quiz"),
    );
  });

  it("splits the surfaces: deadlines and streaks never reach the after strip", () => {
    const shared = input({
      everStudied: true,
      streak: 3,
      tasks: [task()],
      topicsById: {
        "topic-1": topic({
          assets: { notes: 1, cards: 6, dueCards: 2, quizzes: 1 },
          lastStudiedAt: on(2026, 8, 30),
        }),
      },
      day: { pending: 2, total: 4 },
    });
    expect(codesOf(recommend(shared, "home"))).toContain("overdue");
    expect(codesOf(recommend(shared, "home"))).toContain("streak_keep");
    expect(codesOf(recommend(shared, "home"))).not.toContain("day_remainder");

    const after = codesOf(recommend(shared, "after"));
    expect(after).not.toContain("overdue");
    expect(after).not.toContain("due_soon");
    expect(after).not.toContain("streak_keep");
    expect(after).toContain("day_remainder");
    expect(after).toContain("stale_review");
  });
});

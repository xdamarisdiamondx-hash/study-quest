import { describe, expect, it } from "vitest";

import {
  blockTitle,
  daysUntil,
  dayCandidates,
  generateBlocks,
  groupQuest,
  localDate,
  planLoad,
  suggestForTask,
  MAX_GENERATED_BLOCKS,
  type BlockSnapshot,
  type CandidateInput,
  type QuestItem,
  type TaskSnapshot,
  type TopicSnapshot,
} from "./index.ts";

/* --- fixtures --------------------------------------------------------------- */

// Wednesday 7 October 2026 — the same "now" the PRD's example week lives in.
const now = new Date(2026, 9, 7, 9, 0, 0);
const at = (day: number) => new Date(2026, 9, day).toISOString();

function task(over: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    id: "task-1",
    title: "Complete Physics Assignment",
    subjectId: "subject-1",
    topicId: "topic-1",
    kind: "assignment",
    priority: "normal",
    dueAt: at(9), // Friday
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

function block(over: Partial<BlockSnapshot> = {}): BlockSnapshot {
  return {
    id: "block-1",
    kind: "task",
    refId: "task-1",
    plannedMin: 30,
    status: "pending",
    ...over,
  };
}

/* --- suggestForTask (PRD §17) ------------------------------------------------ */

describe("suggestForTask", () => {
  it("reads the PRD's example: review 20 minutes, then a short quiz", () => {
    const suggestion = suggestForTask(task(), topic(), now);
    expect(suggestion).not.toBeNull();
    expect(suggestion!.headline).toBe("Review Motion for 20 minutes, then take a short quiz");
    expect(suggestion!.reason).toBe("Motion sits at 40% mastery, and the task is due Fri");
    expect(suggestion!.steps.map((s) => s.kind)).toEqual(["review", "quiz"]);
    expect(suggestion!.steps[0]!.plannedMin).toBe(20);
    expect(suggestion!.steps[1]!.plannedMin).toBe(10);
  });

  it("needs a topic on both sides", () => {
    expect(suggestForTask(task({ topicId: null }), topic(), now)).toBeNull();
    expect(suggestForTask(task(), topic({ id: "topic-2" }), now)).toBeNull();
    expect(suggestForTask(task(), null, now)).toBeNull();
  });

  it("has nothing to suggest when the topic has no material", () => {
    const bare = topic({ assets: { notes: 0, cards: 0, dueCards: 0, quizzes: 0 } });
    expect(suggestForTask(task(), bare, now)).toBeNull();
  });

  it("scales minutes with the deadline", () => {
    const minutesOf = (dueAt: string | null) =>
      suggestForTask(task({ dueAt }), topic(), now)!.steps[0]!.plannedMin;
    expect(minutesOf(at(6))).toBe(15); // overdue
    expect(minutesOf(at(7))).toBe(15); // today
    expect(minutesOf(at(10))).toBe(20); // +3
    expect(minutesOf(at(13))).toBe(25); // +6
    expect(minutesOf(at(17))).toBe(30); // +10
    expect(minutesOf(null)).toBe(25); // undated
  });

  it("clears the flashcard backlog between reading and quizzing", () => {
    const s = suggestForTask(
      task(),
      topic({ assets: { notes: 1, cards: 30, dueCards: 12, quizzes: 1 } }),
      now,
    );
    expect(s!.steps.map((x) => x.kind)).toEqual(["review", "flashcards", "quiz"]);
    expect(s!.headline).toBe(
      "Review Motion for 20 minutes, then run Motion flashcards for 10 minutes, then take a short quiz",
    );
  });

  it("falls back to flashcards when there is no quiz to take", () => {
    const s = suggestForTask(
      task(),
      topic({ assets: { notes: 1, cards: 20, dueCards: 0, quizzes: 0 } }),
      now,
    );
    expect(s!.steps.map((x) => x.kind)).toEqual(["review", "flashcards"]);
  });

  it("starts with flashcards when the topic has cards but no notes", () => {
    const s = suggestForTask(
      task(),
      topic({ assets: { notes: 0, cards: 20, dueCards: 5, quizzes: 1 } }),
      now,
    );
    expect(s!.steps.map((x) => x.kind)).toEqual(["flashcards", "quiz"]);
    expect(s!.headline.startsWith("Run Motion flashcards for 10 minutes")).toBe(true);
    expect(s!.steps[0]!.label).toBe("Motion flashcards");
  });

  it("keeps a mastered topic to one honest check instead of a review", () => {
    const s = suggestForTask(task(), topic({ mastery: 0.92 }), now);
    expect(s!.steps.map((x) => x.kind)).toEqual(["review"]); // no quiz, no cards
    expect(s!.reason).toBe("Motion is at 92% mastery, and the task is due Fri");
  });

  it("states plainly that an unquizzed topic has never been measured", () => {
    const s = suggestForTask(task(), topic({ mastery: null }), now);
    expect(s!.reason).toBe("Motion has not been quizzed yet, and the task is due Fri");
  });

  it("drops the deadline clause for undated tasks", () => {
    const s = suggestForTask(task({ dueAt: null }), topic(), now);
    expect(s!.reason).toBe("Motion sits at 40% mastery");
  });

  it("capitalises a single-step headline", () => {
    const s = suggestForTask(
      task({ dueAt: null }),
      topic({ assets: { notes: 1, cards: 0, dueCards: 0, quizzes: 0 } }),
      now,
    );
    expect(s!.headline).toBe("Review Motion for 25 minutes");
  });
});

/* --- dayCandidates (suggested mode) ------------------------------------------ */

function candidateInput(over: Partial<CandidateInput> = {}): CandidateInput {
  return {
    tasks: [],
    topicsById: { "topic-1": topic() },
    blockedRefs: [],
    now,
    ...over,
  };
}

describe("dayCandidates", () => {
  it("orders by pressure: overdue, today, tomorrow, then later", () => {
    const list = dayCandidates(
      candidateInput({
        tasks: [
          task({ id: "far", dueAt: at(13), topicId: null }),
          task({ id: "tomorrow", dueAt: at(8), topicId: null }),
          task({ id: "overdue", dueAt: at(5), topicId: null }),
          task({ id: "today", dueAt: at(7), topicId: null }),
        ],
      }),
    );
    expect(list.map((c) => c.task.id)).toEqual(["overdue", "today", "tomorrow", "far"]);
  });

  it("breaks ties by priority, then the assignment/homework bonus", () => {
    const list = dayCandidates(
      candidateInput({
        tasks: [
          task({ id: "low", priority: "low", dueAt: at(9), topicId: null }),
          task({ id: "high", priority: "high", dueAt: at(9), topicId: null }),
          task({ id: "normal", priority: "normal", dueAt: at(9), topicId: null }),
        ],
      }),
    );
    expect(list.map((c) => c.task.id)).toEqual(["high", "normal", "low"]);
  });

  it("keeps out tasks that are already blocked or dismissed", () => {
    const list = dayCandidates(
      candidateInput({ tasks: [task({ id: "a" }), task({ id: "b" })], blockedRefs: ["a"] }),
    );
    expect(list.map((c) => c.task.id)).toEqual(["b"]);
  });

  it("keeps out work that is not yet actionable", () => {
    const list = dayCandidates(
      candidateInput({
        tasks: [
          task({ id: "next-month", dueAt: at(30), topicId: null }),
          task({ id: "undated", dueAt: null, topicId: null }),
        ],
      }),
    );
    expect(list.map((c) => c.task.id)).toEqual(["undated"]);
  });

  it("caps the tray at the generated-plan maximum", () => {
    const tasks = Array.from({ length: 9 }, (_, i) =>
      task({ id: `t${i}`, dueAt: at(8 + i), topicId: null }),
    );
    expect(dayCandidates(candidateInput({ tasks }))).toHaveLength(MAX_GENERATED_BLOCKS);
  });

  it("attaches the topic's prep and defaults missing estimates to 25 minutes", () => {
    const [c] = dayCandidates(
      candidateInput({ tasks: [task({ estimateMin: 0 })], topicsById: { "topic-1": topic() } }),
    );
    expect(c!.taskMinutes).toBe(25);
    expect(c!.suggestion?.steps.length).toBeGreaterThan(0);
    expect(c!.due).toBe("Fri");
  });

  it("has no suggestion for a topicless task", () => {
    const [c] = dayCandidates(candidateInput({ tasks: [task({ topicId: null })] }));
    expect(c!.suggestion).toBeNull();
  });
});

/* --- generateBlocks (automatic mode) ------------------------------------------ */

function generate(over: Partial<Parameters<typeof generateBlocks>[0]> = {}) {
  return generateBlocks({
    tasks: [],
    topics: [],
    keep: [],
    excludeRefs: [],
    capacityMin: 120,
    now,
    ...over,
  });
}

describe("generateBlocks", () => {
  it("schedules the pressing tasks first, sized by their estimates", () => {
    const drafts = generate({
      tasks: [
        task({ id: "far", dueAt: at(16), topicId: null, estimateMin: 60 }),
        task({ id: "overdue", dueAt: at(5), topicId: null, estimateMin: 30 }),
      ],
    });
    expect(drafts.map((d) => d.refId)).toEqual(["overdue", "far"]);
    expect(drafts[0]!.plannedMin).toBe(30);
  });

  it("never plans past capacity", () => {
    const tasks = Array.from({ length: 8 }, (_, i) =>
      task({ id: `t${i}`, dueAt: at(8 + i), topicId: null, estimateMin: 45 }),
    );
    const drafts = generate({ tasks, capacityMin: 90 });
    const total = drafts.reduce((sum, d) => sum + d.plannedMin, 0);
    expect(total).toBeLessThanOrEqual(90);
    expect(total).toBeGreaterThanOrEqual(80); // fills what it can
  });

  it("counts kept-done blocks against the day's capacity", () => {
    const drafts = generate({
      tasks: [task({ id: "new-task", dueAt: at(8), topicId: null, estimateMin: 60 })],
      keep: [block({ id: "done", status: "done", plannedMin: 90 })],
      capacityMin: 120,
    });
    expect(drafts.reduce((s, d) => s + d.plannedMin, 0)).toBeLessThanOrEqual(30);
  });

  it("leaves dismissed work alone", () => {
    const drafts = generate({
      tasks: [task({ id: "declined", dueAt: at(8), topicId: null })],
      excludeRefs: ["declined"],
    });
    expect(drafts).toHaveLength(0);
  });

  it("stops at six blocks even with room to spare", () => {
    const tasks = Array.from({ length: 9 }, (_, i) =>
      task({ id: `t${i}`, dueAt: at(8 + i), topicId: null, estimateMin: 5 }),
    );
    expect(generate({ tasks, capacityMin: 600 })).toHaveLength(MAX_GENERATED_BLOCKS);
  });

  it("boxes a task smaller than its estimate when capacity is nearly gone", () => {
    const drafts = generate({
      tasks: [task({ id: "big", dueAt: at(8), topicId: null, estimateMin: 45 })],
      capacityMin: 30,
    });
    expect(drafts).toEqual([{ kind: "task", refId: "big", plannedMin: 30 }]);
  });

  it("fills the leftovers with the weakest reviewable topic", () => {
    const drafts = generate({
      tasks: [task({ id: "t", dueAt: at(8), topicId: null, estimateMin: 30 })],
      topics: [
        topic({ id: "strong", mastery: 0.9, name: "Energy" }),
        topic({ id: "weak", mastery: 0.2, name: "Waves" }),
        topic({ id: "unmeasured", mastery: null, name: "Optics" }),
      ],
      capacityMin: 120,
    });
    const fills = drafts.filter((d) => d.kind === "review");
    expect(fills.map((f) => f.refId)).toEqual(["unmeasured", "weak"]); // never-quizzed first, mastered skipped
    expect(fills.every((f) => f.plannedMin <= 20)).toBe(true);
  });

  it("uses flashcards for a topic with cards but no notes", () => {
    const drafts = generate({
      topics: [
        topic({ id: "cards-only", assets: { notes: 0, cards: 10, dueCards: 4, quizzes: 0 } }),
      ],
      capacityMin: 60,
    });
    expect(drafts).toEqual([{ kind: "flashcards", refId: "cards-only", plannedMin: 20 }]);
  });

  it("ignores topics with nothing to study from", () => {
    const drafts = generate({
      topics: [topic({ assets: { notes: 0, cards: 0, dueCards: 0, quizzes: 0 } })],
      capacityMin: 60,
    });
    expect(drafts).toHaveLength(0);
  });

  it("does not leave slivers smaller than ten minutes", () => {
    const drafts = generate({
      tasks: [task({ id: "t", dueAt: at(8), topicId: null, estimateMin: 115 })],
      capacityMin: 120,
    });
    expect(drafts).toHaveLength(1); // the 115-minute task, not a 5-minute remnant
    const second = generate({
      tasks: [
        task({ id: "a", dueAt: at(8), topicId: null, estimateMin: 114 }),
        task({ id: "b", dueAt: at(9), topicId: null, estimateMin: 30 }),
      ],
      capacityMin: 120,
    });
    expect(second.map((d) => d.refId)).toEqual(["a"]); // 6 minutes left → nothing fits
  });

  it("ranks undated tasks below anything dated", () => {
    const drafts = generate({
      tasks: [
        task({ id: "undated-high", dueAt: null, topicId: null, priority: "high", estimateMin: 20 }),
        task({ id: "dated-low", dueAt: at(16), topicId: null, priority: "low", estimateMin: 20 }),
      ],
      capacityMin: 40,
    });
    expect(drafts[0]!.refId).toBe("dated-low");
  });
});

/* --- planLoad ----------------------------------------------------------------- */

describe("planLoad", () => {
  it("adds pending and done, skips dismissed", () => {
    const load = planLoad(
      [
        block({ plannedMin: 30, status: "pending" }),
        block({ id: "2", plannedMin: 20, status: "done" }),
        block({ id: "3", plannedMin: 60, status: "dismissed" }),
      ],
      120,
    );
    expect(load.plannedMin).toBe(50);
    expect(load.doneMin).toBe(20);
    expect(load.remainingMin).toBe(70);
    expect(load.ratio).toBeCloseTo(50 / 120);
    expect(load.over).toBe(false);
  });

  it("flags an oversubscribed day", () => {
    const load = planLoad([block({ plannedMin: 150 })], 120);
    expect(load.over).toBe(true);
    expect(load.remainingMin).toBe(-30);
    expect(load.ratio).toBeGreaterThan(1);
  });
});

/* --- groupQuest (PRD §19) ------------------------------------------------------ */

describe("groupQuest", () => {
  const items: QuestItem[] = [
    {
      blockId: "1",
      title: "Review Atomic Structure",
      kind: "review",
      subjectId: "s-chem",
      subjectName: "Chemistry",
      minutes: 25,
      done: true,
    },
    {
      blockId: "2",
      title: "Complete quiz",
      kind: "quiz",
      subjectId: "s-chem",
      subjectName: "Chemistry",
      minutes: 10,
      done: false,
    },
    {
      blockId: "3",
      title: "Complete assignment",
      kind: "task",
      subjectId: "s-math",
      subjectName: "Mathematics",
      minutes: 30,
      done: false,
    },
    {
      blockId: "4",
      title: "Untitled chore",
      kind: "task",
      subjectId: null,
      subjectName: null,
      minutes: 10,
      done: false,
    },
  ];

  it("groups by subject in the order the day introduces them", () => {
    const groups = groupQuest(items);
    expect(groups.map((g) => g.subjectName)).toEqual(["Chemistry", "Mathematics", "No subject"]);
    expect(groups[0]!.items).toHaveLength(2);
    expect(groups[1]!.items.map((i) => i.title)).toEqual(["Complete assignment"]);
  });

  it("keeps finished items in place so progress stays honest", () => {
    const groups = groupQuest(items);
    expect(groups[0]!.items[0]!.done).toBe(true);
    const done = items.filter((i) => i.done).length;
    expect(`${done}/${items.length}`).toBe("1/4");
  });
});

/* --- small helpers -------------------------------------------------------------- */

describe("blockTitle", () => {
  it("speaks each kind's language", () => {
    expect(blockTitle("task", { title: "Complete Physics Assignment" })).toBe(
      "Complete Physics Assignment",
    );
    expect(blockTitle("review", { name: "Motion" })).toBe("Review Motion");
    expect(blockTitle("quiz", { name: "Motion" })).toBe("Quiz: Motion");
    expect(blockTitle("flashcards", { name: "Motion" })).toBe("Flashcards: Motion");
    expect(blockTitle("topic", { name: "Motion" })).toBe("Motion");
  });
});

describe("daysUntil and localDate", () => {
  it("counts whole calendar days, negative into the past", () => {
    expect(daysUntil(at(9), now)).toBe(2);
    expect(daysUntil(at(7), now)).toBe(0);
    expect(daysUntil(at(5), now)).toBe(-2);
  });

  it("pads the local calendar date", () => {
    expect(localDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(localDate(new Date(2026, 9, 7))).toBe("2026-10-07");
  });
});

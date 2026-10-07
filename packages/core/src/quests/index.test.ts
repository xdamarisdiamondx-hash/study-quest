import { describe, expect, it } from "vitest";

import {
  QUEST_KINDS,
  QUEST_TEMPLATES,
  PASS_SCORE,
  countProgress,
  countReachesTarget,
  isQuestComplete,
  questProgress,
  signalMatch,
  specialQuestOffer,
  stepStates,
  templateFor,
  templateSteps,
  templateTitle,
  type OfferInput,
  type QuestStepSnapshot,
  type SignalContext,
} from "./index.ts";

/* --- fixtures --------------------------------------------------------------- */

function step(over: Partial<QuestStepSnapshot> = {}): QuestStepSnapshot {
  return {
    id: "step-1",
    orderIndex: 0,
    kind: "read_notes",
    required: true,
    status: "pending",
    target: 1,
    progress: 0,
    refType: "topic",
    refId: "topic-1",
    ...over,
  };
}

/** The PRD §20 example: five steps, the first three done. */
function photosynthesis(): QuestStepSnapshot[] {
  return [
    step({ id: "s1", orderIndex: 0, kind: "read_notes", status: "done" }),
    step({ id: "s2", orderIndex: 1, kind: "review_summary", status: "done" }),
    step({ id: "s3", orderIndex: 2, kind: "study_flashcards", status: "done" }),
    step({ id: "s4", orderIndex: 3, kind: "complete_quiz" }),
    step({ id: "s5", orderIndex: 4, kind: "final_challenge" }),
  ];
}

function signal(over: Partial<SignalContext> = {}): SignalContext {
  return {
    type: "quiz",
    topicIds: ["topic-1"],
    subjectIds: ["subject-1"],
    score: 1,
    ...over,
  };
}

/* --- step states ------------------------------------------------------------ */

describe("stepStates", () => {
  it("renders the PRD §20 example: three done, next current, last locked", () => {
    expect(stepStates(photosynthesis())).toEqual(["done", "done", "done", "current", "locked"]);
  });

  it("makes the first pending step current and everything after it locked", () => {
    const states = stepStates([step({ orderIndex: 0 }), step({ orderIndex: 1 })]);
    expect(states).toEqual(["current", "locked"]);
  });

  it("keeps an out-of-order finish — work is never shown as undone", () => {
    const steps = [
      step({ id: "s1", orderIndex: 0, kind: "read_notes" }),
      step({ id: "s2", orderIndex: 1, kind: "complete_quiz", status: "done" }),
    ];
    expect(stepStates(steps)).toEqual(["current", "done"]);
  });

  it("never locks an optional step", () => {
    const steps = [
      step({ id: "s1", orderIndex: 0, required: false }),
      step({ id: "s2", orderIndex: 1, required: true }),
    ];
    expect(stepStates(steps)).toEqual(["current", "current"]);
  });

  it("sorts by orderIndex regardless of the order rows arrive in", () => {
    // Arriving reversed: the done step at index 0 must still come back first.
    const steps = [
      step({ id: "b", orderIndex: 1 }),
      step({ id: "a", orderIndex: 0, status: "done" }),
    ];
    expect(stepStates(steps)).toEqual(["done", "current"]);
  });
});

/* --- progress --------------------------------------------------------------- */

describe("questProgress", () => {
  it("counts done steps over the whole quest", () => {
    expect(questProgress(photosynthesis())).toEqual({ done: 3, total: 5 });
  });
});

describe("countProgress", () => {
  it("reads a count step's tally", () => {
    const steps = [
      step({ kind: "study_sessions", refType: "week", refId: null, target: 5, progress: 2 }),
    ];
    expect(countProgress(steps)).toEqual({ progress: 2, target: 5 });
  });

  it("is null when no step counts", () => {
    expect(countProgress(photosynthesis())).toBeNull();
  });
});

describe("isQuestComplete", () => {
  it("is false while one required step is pending", () => {
    expect(isQuestComplete(photosynthesis())).toBe(false);
  });

  it("is true when every required step is done", () => {
    const steps = photosynthesis().map((s) => ({ ...s, status: "done" as const }));
    expect(isQuestComplete(steps)).toBe(true);
  });

  it("is false for a quest with no steps", () => {
    expect(isQuestComplete([])).toBe(false);
  });
});

/* --- signals --------------------------------------------------------------- */

describe("signalMatch", () => {
  it("completes the matching topic step from any activity on that topic", () => {
    const readStep = step({ kind: "read_notes" });
    expect(signalMatch(readStep, signal({ type: "notes_opened" }))).toBe("done");
    expect(signalMatch(step({ kind: "review_summary" }), signal({ type: "summary" }))).toBe("done");
    expect(signalMatch(step({ kind: "study_flashcards" }), signal({ type: "flashcards" }))).toBe(
      "done",
    );
  });

  it("completes a quiz step on any graded attempt", () => {
    const quizStep = step({ kind: "complete_quiz" });
    expect(signalMatch(quizStep, signal({ type: "quiz", score: 0.4 }))).toBe("done");
  });

  it("gates the final challenge behind PASS_SCORE", () => {
    const final = step({ id: "f", kind: "final_challenge" });
    expect(signalMatch(final, signal({ type: "quiz", score: PASS_SCORE }))).toBe("done");
    expect(signalMatch(final, signal({ type: "quiz", score: PASS_SCORE - 0.01 }))).toBe("none");
  });

  it("matches a subject step through the subject ids the caller resolved", () => {
    const subjectStep = step({ kind: "study_flashcards", refType: "subject", refId: "subject-1" });
    expect(signalMatch(subjectStep, signal({ type: "flashcards" }))).toBe("done");
    expect(signalMatch(subjectStep, signal({ type: "flashcards", subjectIds: [] }))).toBe("none");
  });

  it("refuses steps outside the signal's scope", () => {
    const other = step({ refId: "topic-9" });
    expect(signalMatch(other, signal())).toBe("none");
    expect(signalMatch(step({ refType: "week", refId: null }), signal())).toBe("none");
  });

  it("refuses wrong kinds, done steps, and under-target counts", () => {
    expect(signalMatch(step({ kind: "manual" }), signal())).toBe("none");
    expect(signalMatch(step({ kind: "read_notes", status: "done" }), signal())).toBe("none");
    const sessions = step({
      kind: "study_sessions",
      refType: "week",
      refId: null,
      target: 5,
      progress: 4,
    });
    expect(signalMatch(sessions, signal({ type: "session" }))).toBe("count");
    expect(signalMatch(sessions, signal({ type: "quiz" }))).toBe("none");
  });
});

describe("countReachesTarget", () => {
  it("completes exactly at the target and not before", () => {
    expect(countReachesTarget(4, 5)).toBe(false);
    expect(countReachesTarget(5, 5)).toBe(true);
    expect(countReachesTarget(6, 5)).toBe(true); // overshoot stays complete
  });
});

/* --- templates -------------------------------------------------------------- */

describe("QUEST_TEMPLATES", () => {
  it("offers the five kinds of PRD §21", () => {
    expect(QUEST_TEMPLATES.map((t) => t.id)).toEqual([...QUEST_KINDS]);
    for (const t of QUEST_TEMPLATES) expect(t.reward).toBeGreaterThan(0);
  });

  it("resolves any kind and rejects an unknown one", () => {
    expect(templateFor("subject").needs).toBe("subject");
    expect(() => templateFor("nope" as "topic")).toThrow();
  });
});

describe("templateSteps", () => {
  it("builds PRD §20's five activities for a topic", () => {
    const steps = templateSteps("topic", { topicName: "Photosynthesis" });
    expect(steps.map((s) => s.kind)).toEqual([
      "read_notes",
      "review_summary",
      "study_flashcards",
      "complete_quiz",
      "final_challenge",
    ]);
    expect(steps.every((s) => s.refType === "topic")).toBe(true);
    expect(steps[3]!.title).toBe("Take the Photosynthesis quiz");
  });

  it("builds subject-scoped steps for subject and exam quests", () => {
    const subject = templateSteps("subject", { subjectName: "Algebra" });
    expect(subject.map((s) => s.kind)).toEqual([
      "read_notes",
      "study_flashcards",
      "complete_quiz",
      "final_challenge",
    ]);
    expect(subject.every((s) => s.refType === "subject")).toBe(true);
    expect(templateSteps("exam", { subjectName: "Algebra" })).toEqual(subject);
  });

  it("builds one count step for the weekly quest", () => {
    const weekly = templateSteps("weekly", { target: 5 });
    expect(weekly).toHaveLength(1);
    expect(weekly[0]!.kind).toBe("study_sessions");
    expect(weekly[0]!.title).toBe("Complete 5 study sessions this week");
    expect(templateSteps("weekly", {})[0]!.title).toContain("5 study sessions");
  });

  it("leaves personal steps to the student", () => {
    expect(templateSteps("personal", {})).toEqual([]);
  });
});

describe("templateTitle", () => {
  it("names the scope", () => {
    expect(templateTitle("topic", { topicName: "Motion" })).toBe("Master Motion");
    expect(templateTitle("subject", { subjectName: "Physics" })).toBe("Master Physics");
    expect(templateTitle("exam", { subjectName: "Biology" })).toBe("Prepare for Biology");
    expect(templateTitle("weekly", { target: 5 })).toBe("Complete 5 study sessions");
  });
});

/* --- offers ----------------------------------------------------------------- */

function offerInput(over: Partial<OfferInput> = {}): OfferInput {
  return {
    quests: [],
    subjects: [
      { id: "subject-1", name: "Physics", topicCount: 3 },
      { id: "subject-2", name: "Art", topicCount: 1 },
    ],
    topics: [
      {
        id: "topic-1",
        name: "Motion",
        subjectId: "subject-1",
        subjectName: "Physics",
        hasMaterial: true,
      },
      {
        id: "topic-2",
        name: "Colour",
        subjectId: "subject-2",
        subjectName: "Art",
        hasMaterial: false,
      },
    ],
    ...over,
  };
}

describe("specialQuestOffer", () => {
  it("prefers a broad subject over any topic", () => {
    const offer = specialQuestOffer(offerInput());
    expect(offer).toMatchObject({
      template: "subject",
      scopeId: "subject-1",
      title: "Master Physics",
    });
  });

  it("skips subjects too thin to quest, and topics without material", () => {
    const offer = specialQuestOffer(
      offerInput({
        subjects: [{ id: "s", name: "Art", topicCount: 1 }],
        topics: [
          {
            id: "topic-2",
            name: "Colour",
            subjectId: "subject-2",
            subjectName: "Art",
            hasMaterial: false,
          },
        ],
      }),
    );
    expect(offer).toBeNull();
  });

  it("falls back to a topic that already has material", () => {
    const offer = specialQuestOffer(
      offerInput({
        subjects: [{ id: "s", name: "Art", topicCount: 1 }],
        topics: [
          {
            id: "topic-1",
            name: "Motion",
            subjectId: "subject-1",
            subjectName: "Physics",
            hasMaterial: true,
          },
        ],
      }),
    );
    expect(offer).toMatchObject({ template: "topic", scopeId: "topic-1", title: "Master Motion" });
  });

  it("never re-offers a declined scope", () => {
    const input = offerInput({
      quests: [{ kind: "subject", scopeType: "subject", scopeId: "subject-1", status: "declined" }],
    });
    expect(specialQuestOffer(input)).toBeNull();
  });

  it("never re-offers a quest that was completed either", () => {
    const input = offerInput({
      quests: [
        { kind: "subject", scopeType: "subject", scopeId: "subject-1", status: "completed" },
      ],
    });
    expect(specialQuestOffer(input)).toBeNull();
  });

  it("stays quiet about a topic already covered by an active quest", () => {
    const input = offerInput({
      subjects: [],
      quests: [{ kind: "subject", scopeType: "subject", scopeId: "subject-1", status: "active" }],
    });
    expect(specialQuestOffer(input)).toBeNull(); // Motion belongs to the active Physics quest
  });

  it("offers nothing when there is nothing to quest", () => {
    expect(specialQuestOffer({ quests: [], subjects: [], topics: [] })).toBeNull();
  });
});

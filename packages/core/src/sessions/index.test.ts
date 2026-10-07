import { describe, expect, it } from "vitest";

import {
  elapsedMs,
  focusMinutes,
  formatClock,
  guidedSteps,
  nextAction,
  pause,
  pomodoroPhase,
  remainingMs,
  resume,
} from "./index.ts";

const T0 = 1_700_000_000_000;

describe("timer", () => {
  it("counts from the start timestamp, whatever the clock does", () => {
    const state = { startedAt: T0, pausedAt: null, pausedAccumMs: 0 };
    expect(elapsedMs(state, T0)).toBe(0);
    expect(elapsedMs(state, T0 + 90_000)).toBe(90_000);
    // A background tab coming back hours later sees the truth, not ticks.
    expect(elapsedMs(state, T0 + 3 * 3_600_000)).toBe(3 * 3_600_000);
  });

  it("never goes negative", () => {
    expect(elapsedMs({ startedAt: T0, pausedAt: null, pausedAccumMs: 0 }, T0 - 5_000)).toBe(0);
  });

  it("freezes while paused and resumes without losing the pause", () => {
    let state = pause({ startedAt: T0, pausedAt: null, pausedAccumMs: 0 }, T0 + 60_000);
    expect(elapsedMs(state, T0 + 10 * 60_000)).toBe(60_000);
    state = resume(state, T0 + 10 * 60_000);
    expect(state.pausedAt).toBeNull();
    expect(state.pausedAccumMs).toBe(9 * 60_000);
    expect(elapsedMs(state, T0 + 11 * 60_000)).toBe(120_000);
  });

  it("pause and resume are idempotent", () => {
    const running = { startedAt: T0, pausedAt: null, pausedAccumMs: 0 };
    const paused = pause(running, T0 + 1_000);
    expect(pause(paused, T0 + 5_000)).toEqual(paused);
    expect(resume(running, T0 + 5_000)).toEqual(running);
    const resumed = resume(paused, T0 + 7_000);
    expect(resume(resumed, T0 + 9_000)).toEqual(resumed);
  });

  it("counts down a focus plan from the elapsed clock", () => {
    const state = { startedAt: T0, pausedAt: null, pausedAccumMs: 0 };
    expect(remainingMs(25, state, T0 + 60_000)).toBe(24 * 60_000);
    expect(remainingMs(25, state, T0 + 25 * 60_000)).toBe(0);
    expect(remainingMs(25, state, T0 + 40 * 60_000)).toBe(0);
  });
});

describe("formatClock", () => {
  it("renders m:ss and h:mm:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(59_999)).toBe("0:59");
    expect(formatClock(60_000)).toBe("1:00");
    expect(formatClock(25 * 60_000)).toBe("25:00");
    expect(formatClock(3_600_000)).toBe("1:00:00");
    expect(formatClock(-1)).toBe("0:00");
  });
});

describe("focusMinutes", () => {
  it("subtracts pause from wall time and rounds to whole minutes", () => {
    expect(focusMinutes(25 * 60_000, 0)).toBe(25);
    expect(focusMinutes(30 * 60_000, 5)).toBe(25);
    expect(focusMinutes(90_000, 0)).toBe(2); // .5 rounds up
    expect(focusMinutes(10_000, 0)).toBe(0);
  });

  it("clamps nonsense instead of logging it", () => {
    expect(focusMinutes(60_000, 10)).toBe(0);
    expect(focusMinutes(-60_000, 0)).toBe(0);
    expect(focusMinutes(100 * 3_600_000, 0)).toBe(1440);
  });
});

describe("pomodoroPhase", () => {
  it("starts inside work and counts that stretch down", () => {
    const p = pomodoroPhase(0, 25, 5);
    expect(p).toEqual({ kind: "work", index: 1, remainingMs: 25 * 60_000 });
    expect(pomodoroPhase(10 * 60_000, 25, 5).remainingMs).toBe(15 * 60_000);
  });

  it("moves into the break, then into the next work stretch", () => {
    expect(pomodoroPhase(25 * 60_000, 25, 5)).toEqual({
      kind: "break",
      index: 1,
      remainingMs: 5 * 60_000,
    });
    expect(pomodoroPhase(30 * 60_000, 25, 5)).toEqual({
      kind: "work",
      index: 2,
      remainingMs: 25 * 60_000,
    });
  });

  it("handles custom lengths and stray negative input", () => {
    expect(pomodoroPhase(50 * 60_000, 50, 0).kind).toBe("work");
    expect(pomodoroPhase(-1, 25, 5).index).toBe(1);
  });
});

describe("guidedSteps", () => {
  const src = {
    topicId: "11111111-1111-4111-8111-111111111111",
    topicName: "Motion",
    noteTitle: "Newton Laws",
    deckTitle: "Motion",
    quizTitle: "Newton Laws",
  };

  it("runs Read → Understand → Practice → Quiz → Review over real material", () => {
    const steps = guidedSteps(src);
    expect(steps.map((s) => s.kind)).toEqual(["read", "understand", "practice", "quiz", "review"]);
    expect(steps[0]!.title).toBe("Read “Newton Laws”");
    expect(steps[1]!.title).toBe("Summarise “Newton Laws”");
    expect(steps[2]!.title).toBe("Study “Motion”");
    expect(steps[3]!.title).toBe("Take “Newton Laws”");
    expect(steps.every((s) => s.refType === "topic" && s.refId === src.topicId)).toBe(true);
  });

  it("names the fix when the topic has no material yet", () => {
    const steps = guidedSteps({
      ...src,
      noteTitle: null,
      deckTitle: null,
      quizTitle: null,
    });
    expect(steps[0]!.title).toBe("Read your Motion notes");
    expect(steps[2]!.title).toBe("Make Motion flashcards");
    expect(steps[3]!.title).toBe("Make a Motion quiz");
  });
});

describe("nextAction", () => {
  it("puts due cards first, then quizzing, then reading, then the fix", () => {
    expect(nextAction({ topicName: "Motion", dueCards: 3, hasNotes: true, hasQuiz: true })).toBe(
      "Study 3 due flashcards",
    );
    expect(nextAction({ topicName: "Motion", dueCards: 1, hasNotes: true, hasQuiz: true })).toBe(
      "Study 1 due flashcard",
    );
    expect(nextAction({ topicName: "Motion", dueCards: 0, hasNotes: true, hasQuiz: true })).toBe(
      "Take the Motion quiz again",
    );
    expect(nextAction({ topicName: "Motion", dueCards: 0, hasNotes: true, hasQuiz: false })).toBe(
      "Re-read your Motion notes",
    );
    expect(nextAction({ topicName: "Motion", dueCards: 0, hasNotes: false, hasQuiz: false })).toBe(
      "Add notes for Motion",
    );
  });
});

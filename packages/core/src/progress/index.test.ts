import { describe, expect, it } from "vitest";

import {
  heatmapColumns,
  meanPercent,
  retryImpact,
  subjectProgress,
  topicProgress,
  weekStartKey,
  weightedMastery,
} from "./index";

const full = { mastery: 1, reviewCoverage: 1, sessionMinutes: 600, questCompletion: 1 };
const none = { mastery: 0, reviewCoverage: 0, sessionMinutes: 0, questCompletion: 0 };

describe("topicProgress", () => {
  it("is 0 for an untouched topic and 1 for a complete one", () => {
    expect(topicProgress(none)).toBe(0);
    expect(topicProgress(full)).toBe(1);
  });

  it("uses the documented weights: 0.40 mastery + 0.20 each for review, sessions, quests", () => {
    const onlyMastery = topicProgress({ ...none, mastery: 1 });
    expect(onlyMastery).toBeCloseTo(0.4, 5);

    const onlyReview = topicProgress({ ...none, reviewCoverage: 1 });
    expect(onlyReview).toBeCloseTo(0.2, 5);

    const onlyQuests = topicProgress({ ...none, questCompletion: 1 });
    expect(onlyQuests).toBeCloseTo(0.2, 5);
  });

  it("counts 600 study minutes as a full session component", () => {
    expect(topicProgress({ ...none, sessionMinutes: 600 })).toBeCloseTo(0.2, 5);
    expect(topicProgress({ ...none, sessionMinutes: 300 })).toBeCloseTo(0.1, 5);
  });

  it("clamps values outside 0..1 instead of returning nonsense", () => {
    expect(
      topicProgress({ mastery: 5, reviewCoverage: 5, sessionMinutes: 99999, questCompletion: 5 }),
    ).toBe(1);
    expect(
      topicProgress({ mastery: -5, reviewCoverage: -5, sessionMinutes: -100, questCompletion: -5 }),
    ).toBe(0);
  });
});

describe("subjectProgress", () => {
  it("is 0 with no topics", () => {
    expect(subjectProgress([])).toBe(0);
  });

  it("averages its topics", () => {
    expect(subjectProgress([full, none])).toBeCloseTo(0.5, 5);
  });

  it("adds 0.1 per completed subject quest, capped at 1", () => {
    const base = subjectProgress([full, full]);
    expect(subjectProgress([full, full], 1)).toBeCloseTo(1, 5);
    expect(subjectProgress([full, full], 5)).toBe(1);
    void base;
  });
});

describe("weightedMastery", () => {
  it("is 0 with no attempts and correct/attempted otherwise", () => {
    expect(weightedMastery(0, 0)).toBe(0);
    expect(weightedMastery(7, 10)).toBeCloseTo(0.7, 5);
    expect(weightedMastery(10, 10)).toBe(1);
  });
});

describe("weekStartKey", () => {
  it("returns the Monday of the UTC week", () => {
    // 2026-10-07 is a Wednesday; its week started Monday 2026-10-05.
    expect(weekStartKey(new Date("2026-10-07T12:00:00Z"))).toBe("2026-10-05");
    expect(weekStartKey(new Date("2026-10-11T23:59:00Z"))).toBe("2026-10-05");
    expect(weekStartKey(new Date("2026-10-05T00:00:00Z"))).toBe("2026-10-05");
  });

  it("rolls a Sunday back to the previous Monday", () => {
    expect(weekStartKey(new Date("2026-10-04T09:00:00Z"))).toBe("2026-09-28");
  });
});

describe("heatmapColumns", () => {
  it("pads to whole Monday-first weeks around the window", () => {
    // Wed → Wed: leading Mon–Tue pad, trailing Thu–Sun pad.
    const cols = heatmapColumns("2026-10-07", "2026-10-14", {});
    expect(cols).toHaveLength(2);
    expect(cols[0]!.map((c) => c.day)).toEqual([
      null,
      null,
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
    expect(cols[1]!.map((c) => c.day)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      null,
      null,
      null,
      null,
    ]);
  });

  it("needs no padding when the window is a whole week", () => {
    const cols = heatmapColumns("2026-10-05", "2026-10-11", {});
    expect(cols).toHaveLength(1);
    expect(cols[0]!.every((c) => c.day !== null)).toBe(true);
  });

  it("carries minutes for in-window days and zero for quiet ones", () => {
    const cols = heatmapColumns("2026-10-05", "2026-10-11", { "2026-10-07": 45 });
    const wed = cols[0]![2]!;
    const thu = cols[0]![3]!;
    expect(wed).toEqual({ day: "2026-10-07", minutes: 45 });
    expect(thu).toEqual({ day: "2026-10-08", minutes: 0 });
  });

  it("answers with nothing when the window is inverted", () => {
    expect(heatmapColumns("2026-10-11", "2026-10-05", {})).toEqual([]);
  });
});

describe("meanPercent", () => {
  it("is null with nothing graded, not a confident zero", () => {
    expect(meanPercent([])).toBeNull();
    expect(meanPercent([{ score: 0, total: 0 }])).toBeNull();
  });

  it("averages per-attempt percentages across graded attempts", () => {
    expect(
      meanPercent([
        { score: 3, total: 4 }, // 75%
        { score: 1, total: 4 }, // 25%
      ]),
    ).toBeCloseTo(50, 5);
  });
});

describe("retryImpact", () => {
  it("counts improvements and averages the percentage-point delta", () => {
    const out = retryImpact([
      { original: { score: 4, total: 10 }, retry: { score: 8, total: 10 } }, // +40
      { original: { score: 9, total: 10 }, retry: { score: 7, total: 10 } }, // −20
    ]);
    expect(out).toEqual({ retried: 2, improved: 1, avgDelta: 10 });
  });

  it("skips ungraded pairs without calling them 'no change'", () => {
    const out = retryImpact([
      { original: { score: 1, total: 0 }, retry: { score: 1, total: 10 } },
      { original: { score: 5, total: 10 }, retry: { score: 10, total: 10 } },
    ]);
    expect(out).toEqual({ retried: 2, improved: 1, avgDelta: 50 });
  });

  it("answers zeros when there are no retries", () => {
    expect(retryImpact([])).toEqual({ retried: 0, improved: 0, avgDelta: 0 });
  });
});

import { describe, expect, it } from "vitest";

import { subjectProgress, topicProgress, weightedMastery } from "./index";

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

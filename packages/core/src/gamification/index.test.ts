import { describe, expect, it } from "vitest";

import {
  ACHIEVEMENTS,
  LEVEL_TITLES,
  XP,
  achievementProgress,
  type AchievementFacts,
  levelForXp,
  levelProgress,
  levelTitle,
  registerActivity,
  xpRequired,
} from "./index";

describe("xp curve", () => {
  it("starts level 1 at zero and is monotonic", () => {
    expect(xpRequired(1)).toBe(0);
    expect(xpRequired(2)).toBe(100);
    for (let n = 1; n < 60; n++) expect(xpRequired(n + 1)).toBeGreaterThan(xpRequired(n));
  });

  it("matches the values documented in the architecture plan", () => {
    expect(xpRequired(3)).toBe(255);
    expect(xpRequired(5)).toBe(650);
    expect(xpRequired(10)).toBe(1942);
    expect(xpRequired(20)).toBe(5325);
  });
});

describe("levelForXp", () => {
  it("returns level 1 below the first threshold", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
  });

  it("is exact at a threshold and just below it", () => {
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(254)).toBe(2);
    expect(levelForXp(255)).toBe(3);
    expect(levelForXp(649)).toBe(4);
    expect(levelForXp(650)).toBe(5);
  });

  it("never returns 0 or a negative", () => {
    expect(levelForXp(-50)).toBe(1);
  });
});

describe("levelProgress", () => {
  it("reports the fraction toward the next level", () => {
    const p = levelProgress(xpRequired(5));
    expect(p.level).toBe(5);
    expect(p.into).toBe(0);
    expect(p.needed).toBe(xpRequired(6) - xpRequired(5));
    expect(p.fraction).toBe(0);

    const half = levelProgress(xpRequired(5) + Math.round((xpRequired(6) - xpRequired(5)) / 2));
    expect(half.level).toBe(5);
    expect(half.fraction).toBeGreaterThan(0.4);
    expect(half.fraction).toBeLessThan(0.6);
  });

  it("gives the sample profile in the mock data level 7", () => {
    const p = levelProgress(1240);
    expect(p.level).toBe(7);
    expect(p.into).toBeGreaterThan(0);
  });
});

describe("level titles", () => {
  it("returns a title for every level and clamps out-of-range input", () => {
    expect(levelTitle(1)).toBe(LEVEL_TITLES[0]);
    expect(levelTitle(999)).toBe(LEVEL_TITLES[LEVEL_TITLES.length - 1]);
    expect(levelTitle(0)).toBe(LEVEL_TITLES[0]);
  });
});

describe("XP awards", () => {
  it("matches PRD section 22", () => {
    expect(XP.quizAttempt).toBe(10);
    expect(XP.session).toBe(100);
    expect(XP.questComplete).toBe(500);
  });
});

describe("registerActivity", () => {
  const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n, 12));

  it("starts a streak at 1 on first activity", () => {
    const s = registerActivity(
      { current: 0, longest: 0, lastActiveDate: null, freezeCount: 0 },
      day(0),
    );
    expect(s.current).toBe(1);
    expect(s.longest).toBe(1);
  });

  it("does not double-count two activities on the same day", () => {
    const first = registerActivity(
      { current: 0, longest: 0, lastActiveDate: null, freezeCount: 0 },
      day(0),
    );
    const second = registerActivity(first, day(0));
    expect(second.current).toBe(1);
  });

  it("extends a streak on the next consecutive day", () => {
    const s1 = registerActivity(
      { current: 1, longest: 1, lastActiveDate: "2026-10-01", freezeCount: 0 },
      day(1),
    );
    expect(s1.current).toBe(2);
    expect(s1.longest).toBe(2);
  });

  it("absorbs exactly one missed day when a freeze is available, and spends it", () => {
    const s = registerActivity(
      { current: 5, longest: 5, lastActiveDate: "2026-10-01", freezeCount: 1 },
      day(2), // one missed day (2 Oct)
    );
    expect(s.current).toBe(6);
    expect(s.freezeCount).toBe(0);
  });

  it("resets when a day is missed with no freeze left", () => {
    const s = registerActivity(
      { current: 9, longest: 9, lastActiveDate: "2026-10-01", freezeCount: 0 },
      day(2),
    );
    expect(s.current).toBe(1);
    expect(s.longest).toBe(9); // longest is never lost
  });

  it("does not let one freeze cover two missed days", () => {
    const s = registerActivity(
      { current: 5, longest: 5, lastActiveDate: "2026-10-01", freezeCount: 1 },
      day(3), // two missed days
    );
    expect(s.current).toBe(1);
  });

  it("holds at most three freezes", () => {
    let s = { current: 0, longest: 0, lastActiveDate: null as string | null, freezeCount: 0 };
    for (let d = 0; d < 60; d++) s = registerActivity(s, day(d));
    expect(s.freezeCount).toBeLessThanOrEqual(3);
  });
});

describe("achievement catalogue", () => {
  const facts = (over: Partial<AchievementFacts> = {}): AchievementFacts => ({
    questsCompleted: 0,
    quizzesCompleted: 0,
    streakDays: 0,
    subjectsStudied: 0,
    improvedAfterRetry: false,
    notesCreated: 0,
    flashcardsReviewed: 0,
    sessionsCompleted: 0,
    earliestSessionHour: null,
    ...over,
  });

  it("has the five PRD section 23 examples among its ten", () => {
    const codes = ACHIEVEMENTS.map((a) => a.code);
    expect(ACHIEVEMENTS).toHaveLength(10);
    for (const code of [
      "first_quest",
      "quiz_master",
      "consistent_learner",
      "subject_explorer",
      "comeback",
    ])
      expect(codes).toContain(code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("never rewards mere app opening", () => {
    // Every criterion counts rows of real work; an untouched account unlocks none.
    const untouched = facts();
    for (const a of ACHIEVEMENTS)
      expect(achievementProgress(a.criteria, untouched).unlocked, a.code).toBe(false);
  });

  it("counts numeric criteria up to their target and clamps the bar", () => {
    const quizMaster = ACHIEVEMENTS.find((a) => a.code === "quiz_master")!;
    const half = achievementProgress(quizMaster.criteria, facts({ quizzesCompleted: 5 }));
    expect(half).toEqual({ progress: 5, target: 10, unlocked: false });

    const full = achievementProgress(quizMaster.criteria, facts({ quizzesCompleted: 12 }));
    expect(full.unlocked).toBe(true);
    expect(full.progress).toBe(10); // clamped: a full bar means done
  });

  it("gates boolean criteria on the flag alone", () => {
    const comeback = ACHIEVEMENTS.find((a) => a.code === "comeback")!;
    expect(achievementProgress(comeback.criteria, facts()).unlocked).toBe(false);
    expect(
      achievementProgress(comeback.criteria, facts({ improvedAfterRetry: true })).unlocked,
    ).toBe(true);
  });

  it("treats the early-bird hour as before, never at-or-after", () => {
    const early = ACHIEVEMENTS.find((a) => a.code === "early_bird")!;
    expect(achievementProgress(early.criteria, facts({ earliestSessionHour: 7 })).unlocked).toBe(
      true,
    );
    expect(achievementProgress(early.criteria, facts({ earliestSessionHour: 8 })).unlocked).toBe(
      false,
    );
    expect(achievementProgress(early.criteria, facts()).unlocked).toBe(false);
  });

  it("never unlocks from empty criteria", () => {
    expect(achievementProgress({}, facts()).unlocked).toBe(false);
  });
});

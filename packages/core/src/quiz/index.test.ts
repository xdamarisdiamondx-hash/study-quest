import { describe, expect, it } from "vitest";

import {
  finalVerdict,
  gradeAnswer,
  gradeQuiz,
  nextMastery,
  retryFocus,
  scoreOf,
  weakConcepts,
  type QuizVerdict,
} from "./index";

const mcq = (correctAnswer: string) => ({ type: "mcq", correctAnswer });
const tf = (correctAnswer: string) => ({ type: "true_false", correctAnswer });
const short = (correctAnswer: string) => ({ type: "short_answer", correctAnswer });

describe("gradeAnswer — multiple choice and true/false", () => {
  it("marks an exact match correct", () => {
    expect(gradeAnswer(mcq("Net force"), "Net force")).toBe("correct");
  });

  it("is insensitive to case and punctuation (they are presentation)", () => {
    expect(gradeAnswer(mcq("net force!"), "  Net  FORCE ")).toBe("correct");
    expect(gradeAnswer(tf("true"), "True.")).toBe("correct");
  });

  it("tolerates accents stripped by normalisation", () => {
    expect(gradeAnswer(mcq("café"), "Cafe")).toBe("correct");
  });

  it("marks a different option incorrect", () => {
    expect(gradeAnswer(mcq("Momentum"), "Force")).toBe("incorrect");
    expect(gradeAnswer(tf("True"), "False")).toBe("incorrect");
  });

  it("marks an unanswered question incorrect, not undecidable", () => {
    expect(gradeAnswer(mcq("Momentum"), "")).toBe<QuizVerdict>("incorrect");
    expect(gradeAnswer(tf("True"), "   ")).toBe("incorrect");
  });
});

describe("gradeAnswer — short answer", () => {
  it("accepts an exact match in any casing", () => {
    expect(gradeAnswer(short("Inertia"), "inertia")).toBe("correct");
  });

  it("accepts every reference word in any order", () => {
    expect(gradeAnswer(short("the net force"), "force, net")).toBe("correct");
  });

  it("tolerates a plural on either side", () => {
    expect(gradeAnswer(short("newton"), "newtons")).toBe("correct");
    expect(gradeAnswer(short("forces"), "force")).toBe("correct");
  });

  it("returns needs_review when some but not all reference words appear", () => {
    expect(gradeAnswer(short("net force"), "the force pushes it")).toBe("needs_review");
  });

  it("returns incorrect when nothing meaningful overlaps", () => {
    expect(gradeAnswer(short("momentum"), "photosynthesis")).toBe("incorrect");
    expect(gradeAnswer(short("mass times acceleration"), "a banana")).toBe("incorrect");
  });

  it("marks an unanswered short answer incorrect", () => {
    expect(gradeAnswer(short("anything"), "")).toBe("incorrect");
  });

  it("ignores stop words, which cannot identify an answer", () => {
    expect(gradeAnswer(short("the of and"), "the of and")).toBe("correct");
    expect(gradeAnswer(short("momentum"), "the and of")).toBe("incorrect");
  });
});

describe("finalVerdict — self-marks", () => {
  it("lets the student settle a needs_review answer", () => {
    expect(finalVerdict("needs_review", "correct")).toBe("correct");
    expect(finalVerdict("needs_review", "incorrect")).toBe("incorrect");
  });

  it("counts an undecided needs_review against the score", () => {
    expect(finalVerdict("needs_review")).toBe("incorrect");
  });

  it("never lets a self-mark overrule an exact grade", () => {
    expect(finalVerdict("correct", "incorrect")).toBe("correct");
    expect(finalVerdict("incorrect", "correct")).toBe("incorrect");
  });
});

describe("gradeQuiz", () => {
  const questions = [
    { id: "11111111-1111-4111-8111-111111111111", type: "mcq", correctAnswer: "A" },
    {
      id: "22222222-2222-4222-8222-222222222222",
      type: "short_answer",
      correctAnswer: "net force",
    },
    { id: "33333333-3333-4333-8333-333333333333", type: "true_false", correctAnswer: "True" },
  ];

  it("grades in question order and treats missing answers as unanswered", () => {
    const results = gradeQuiz(questions, [{ questionId: questions[0]!.id, answer: "A" }]);
    expect(results.map((r) => r.correct)).toEqual([true, false, false]);
    expect(results[1]?.answer).toBe("");
    expect(results[1]?.verdict).toBe("incorrect");
  });

  it("applies a self-mark only where the rule was undecided", () => {
    const results = gradeQuiz(questions, [
      { questionId: questions[1]!.id, answer: "the force", selfMark: "correct" },
      { questionId: questions[2]!.id, answer: "True", selfMark: "incorrect" },
    ]);
    expect(results[0]?.correct).toBe(false); // unanswered mcq, self-mark ignored
    expect(results[1]?.verdict).toBe("needs_review");
    expect(results[1]?.correct).toBe(true); // student settled it
    expect(results[2]?.correct).toBe(true); // exact grade overrules the self-mark
  });

  it("keeps the first submission when an id is repeated", () => {
    const results = gradeQuiz(questions, [
      { questionId: questions[0]!.id, answer: "A" },
      { questionId: questions[0]!.id, answer: "B" },
    ]);
    expect(results[0]?.answer).toBe("A");
  });

  it("ignores submissions for ids that are not in the quiz", () => {
    const results = gradeQuiz(questions, [
      { questionId: "44444444-4444-4444-8444-444444444444", answer: "A" },
    ]);
    expect(results.every((r) => !r.correct)).toBe(true);
    expect(results).toHaveLength(3);
  });

  it("scores what it graded", () => {
    const results = gradeQuiz(questions, [
      { questionId: questions[0]!.id, answer: "A" },
      { questionId: questions[2]!.id, answer: "True" },
    ]);
    expect(scoreOf(results)).toEqual({ score: 2, total: 3 });
  });
});

describe("weakConcepts", () => {
  it("groups by concept, worst first, skipping untagged questions", () => {
    const items = [
      { conceptTag: "Momentum", correct: false },
      { conceptTag: "momentum", correct: false }, // same group, any casing
      { conceptTag: "Forces", correct: false },
      { conceptTag: "Forces", correct: true },
      { conceptTag: null, correct: false },
      { conceptTag: "", correct: false },
      { conceptTag: "Waves", correct: true },
    ];
    expect(weakConcepts(items)).toEqual([
      { conceptTag: "Momentum", missed: 2, total: 2 },
      { conceptTag: "Forces", missed: 1, total: 2 },
      // "Waves" is gone: answered correctly everywhere, so it is not up for review.
    ]);
  });

  it("leaves fully correct concepts out — nothing slipped to review", () => {
    expect(weakConcepts([{ conceptTag: "Optics", correct: true }])).toEqual([]);
  });

  it("returns nothing when no question carries a tag", () => {
    expect(weakConcepts([{ correct: false }, { conceptTag: null, correct: false }])).toEqual([]);
  });
});

describe("retryFocus", () => {
  const weak = [
    { conceptTag: "Momentum", missed: 2, total: 2 },
    { conceptTag: "Forces", missed: 1, total: 3 },
    { conceptTag: "Waves", missed: 1, total: 1 },
    { conceptTag: "Energy", missed: 0, total: 4 },
  ];

  it("takes the concepts actually missed, worst first", () => {
    expect(retryFocus(weak)).toEqual(["Momentum", "Forces", "Waves"]);
  });

  it("never focuses on a concept the student got right", () => {
    expect(retryFocus([{ conceptTag: "Energy", missed: 0, total: 4 }])).toEqual([]);
  });

  it("respects a custom cap", () => {
    expect(retryFocus(weak, 1)).toEqual(["Momentum"]);
    expect(retryFocus(weak, 0)).toEqual([]);
  });
});

describe("nextMastery", () => {
  const fresh = { attempts: 0, correct: 0, mastery: 0 };

  it("a first correct answer is full mastery", () => {
    expect(nextMastery(fresh, true)).toEqual({ attempts: 1, correct: 1, mastery: 1 });
  });

  it("a first wrong answer stays at zero", () => {
    expect(nextMastery(fresh, false)).toEqual({ attempts: 1, correct: 0, mastery: 0 });
  });

  it("folds in rolling accuracy — recoverable, bounded to 0..1", () => {
    const state = { attempts: 4, correct: 1, mastery: 0.25 };
    const recovered = nextMastery(state, true);
    expect(recovered).toEqual({ attempts: 5, correct: 2, mastery: 0.4 });
    expect(recovered.mastery).toBeGreaterThan(state.mastery);

    const worse = nextMastery({ attempts: 3, correct: 3, mastery: 1 }, false);
    expect(worse.mastery).toBeCloseTo(0.75);
  });

  it("agrees with the progress module's formula (one source of truth)", () => {
    // weightedMastery(correct, attempts) === correct/attempts, clamped.
    expect(nextMastery({ attempts: 7, correct: 5, mastery: 5 / 7 }, true).mastery).toBeCloseTo(
      6 / 8,
    );
  });
});

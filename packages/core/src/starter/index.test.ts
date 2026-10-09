import { describe, expect, it } from "vitest";

import { STARTER_SUBJECTS, monogramFor } from "./index";

describe("monogramFor", () => {
  it("takes the initials of two words", () => {
    expect(monogramFor("Advanced Physics")).toBe("AP");
    expect(monogramFor("Computer Science")).toBe("CS");
  });

  it("takes the first two letters of a single word", () => {
    expect(monogramFor("Physics")).toBe("Ph");
    expect(monogramFor("Biology")).toBe("Bi");
    expect(monogramFor("Maths")).toBe("Ma");
  });

  it("handles a one-letter name without producing an empty tile", () => {
    expect(monogramFor("X")).toBe("X");
  });

  it("never returns empty for blank or whitespace input", () => {
    expect(monogramFor("")).toBe("?");
    expect(monogramFor("   ")).toBe("?");
  });
});

describe("starter subjects", () => {
  it("every template has a two-letter monogram and at least one topic", () => {
    for (const s of STARTER_SUBJECTS) {
      // Mixed case on purpose: "Ph", not "PH".
      expect(s.monogram).toMatch(/^[A-Z][A-Za-z]?$/);
      expect(s.monogram.length).toBe(2);
      expect(s.topics.length).toBeGreaterThan(0);
      expect(monogramFor(s.name).length).toBe(2);
    }
  });

  it("has no duplicate subject names", () => {
    const names = STARTER_SUBJECTS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("worked example material (P22)", () => {
  const withExample = STARTER_SUBJECTS.filter((s) => s.example);

  it("ships on exactly one subject, so the picker's hint means one specific set", () => {
    expect(withExample).toHaveLength(1);
  });

  it("targets topics the subject actually has", () => {
    for (const s of withExample) {
      const topics = s.topics.map((t) => t.name);
      expect(topics).toContain(s.example!.note.topic);
      expect(topics).toContain(s.example!.quiz.topic);
      expect(topics).toContain(s.example!.deck.topic);
    }
  });

  it("every quiz answer is one of its own options — grading compares text, never an index", () => {
    for (const s of withExample) {
      for (const q of s.example!.quiz.questions) {
        expect(q.options.length).toBeGreaterThanOrEqual(3);
        expect(new Set(q.options).size).toBe(q.options.length);
        expect(q.options).toContain(q.answer);
        expect(q.explanation.trim()).not.toBe("");
        expect(q.prompt.trim()).not.toBe("");
      }
    }
  });

  it("is big enough to be worth opening", () => {
    for (const s of withExample) {
      expect(s.example!.quiz.questions.length).toBeGreaterThanOrEqual(4);
      expect(s.example!.deck.cards.length).toBeGreaterThanOrEqual(6);
      for (const c of s.example!.deck.cards) {
        expect(c.front.trim()).not.toBe("");
        expect(c.back.trim()).not.toBe("");
      }
    }
  });

  it("the note is prose, not a placeholder", () => {
    for (const s of withExample) {
      const words = s.example!.note.bodyMd.split(/\s+/).filter(Boolean);
      expect(words.length).toBeGreaterThan(120);
      expect(s.example!.note.title).not.toMatch(/lorem|todo|tbd|placeholder/i);
      expect(s.example!.note.bodyMd).not.toMatch(/lorem ipsum/i);
    }
  });
});

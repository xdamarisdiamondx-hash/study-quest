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

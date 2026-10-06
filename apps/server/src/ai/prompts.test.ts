/**
 * Prompt registry tests (P6).
 *
 * Each prompt has to (1) build its messages from its own input rather than a fixed string,
 * (2) carry the limits the cost model depends on (ADR-025), and (3) have a golden answer the
 * mock adapter can replay, so every prompt has a network-free path. Structured prompts must
 * additionally satisfy the schema they declare (ADR-009).
 */
import { describe, expect, it } from "vitest";

import type { QuizOutput } from "@sq/core/schemas/ai";
import { plainText } from "@sq/core/markdown";

import { PROMPTS, getPrompt, type PromptInput, type PromptKey } from "./prompts.ts";

const NOTE = {
  title: "Newton's first law",
  bodyMd: [
    "# Newton's first law",
    "An object at rest stays at rest unless a net force acts on it.",
    "Mass resists a change in motion.",
    "Friction is the force that usually stops things.",
  ].join("\n"),
};

/** The facts of the note, exactly as `concepts()` reads them. */
const FACTS = plainText(NOTE.bodyMd).split("\n");

const SAMPLE: PromptInput = {
  "summary.v1": { ...NOTE, length: "standard", format: "bullets" },
  "explain.v1": { text: "why friction stops motion", style: "simple", context: NOTE.bodyMd },
  "quiz.v1": { ...NOTE, questionCount: 4, difficulty: "mixed", types: ["mcq", "true_false"] },
  "flashcards.v1": { ...NOTE, cardCount: 3 },
};

describe.each(Object.keys(PROMPTS) as PromptKey[])("%s", (key) => {
  const entry = getPrompt(key);
  const input = SAMPLE[key];

  it("builds a system and a user message from this input", () => {
    const messages = entry.build(input);

    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages[0]?.role).toBe("system");
    expect(messages.every((m) => m.content.trim().length > 0)).toBe(true);

    // Whatever went in has to come back out: a prompt that ignores its input is a prompt
    // that would summarise the wrong note.
    const needle =
      key === "explain.v1" ? SAMPLE["explain.v1"].text : (input as { title: string }).title;
    expect(messages.map((m) => m.content).join("\n")).toContain(needle);
  });

  it("has a golden answer the mock adapter can replay", () => {
    const golden = entry.mock(input);

    expect(golden).toBeDefined();
    if (entry.schema) {
      expect(entry.schema.safeParse(golden).success).toBe(true);
    } else {
      expect(typeof golden).toBe("string");
      expect(String(golden).trim().length).toBeGreaterThan(0);
    }
  });

  it("answers the same way every time", () => {
    expect(JSON.stringify(entry.mock(input))).toBe(JSON.stringify(entry.mock(input)));
  });
});

describe("summary.v1", () => {
  const entry = PROMPTS["summary.v1"];

  it("states the length and format that were asked for", () => {
    const user = entry.build({ ...NOTE, length: "quick", format: "paragraph" })[1]?.content ?? "";

    expect(user).toContain("at most 60 words");
    expect(user).toContain("one flowing paragraph");
  });

  it("forbids adding facts that are not in the notes", () => {
    expect(entry.build(SAMPLE["summary.v1"])[0]?.content ?? "").toContain(
      "never add facts that are not there",
    );
  });

  it("caps a very large note before it reaches the model", () => {
    const asked = entry
      .build({ ...SAMPLE["summary.v1"], bodyMd: "word ".repeat(20_000) })
      .map((m) => m.content)
      .join("\n");

    expect(asked.length).toBeLessThan(14_000);
  });

  it("golden: bullets from a known note", () => {
    const golden = entry.mock({
      title: "Forces",
      bodyMd: "- Friction opposes motion.\n- Energy is conserved.",
      length: "standard",
      format: "bullets",
    });

    expect(golden).toBe("- Friction opposes motion.\n- Energy is conserved.");
  });
});

describe("explain.v1", () => {
  const entry = PROMPTS["explain.v1"];

  it("names the style it was asked for, with that style's rule", () => {
    const user = entry.build({ text: "why things fall", style: "step_by_step" })[1]?.content ?? "";

    expect(user).toContain("Explain this in a step-by-step way");
    expect(user).toContain("numbered steps");
  });

  it("includes the notes only when context was given", () => {
    const withContext = entry
      .build(SAMPLE["explain.v1"])
      .map((m) => m.content)
      .join("\n");
    const without = entry
      .build({ text: "why things fall", style: "simple" })
      .map((m) => m.content)
      .join("\n");

    expect(withContext).toContain("Their notes for context");
    expect(without).not.toContain("Their notes for context");
  });

  it("keeps to the word budget it promises the student", () => {
    expect(entry.build(SAMPLE["explain.v1"])[0]?.content ?? "").toContain("under 180 words");
  });
});

describe("quiz.v1", () => {
  const entry = PROMPTS["quiz.v1"];

  it("asks for exactly the number of questions requested", () => {
    const user = entry.build({ ...SAMPLE["quiz.v1"], questionCount: 7 })[1]?.content ?? "";

    expect(user).toContain("exactly 7 questions");
    expect(user).toContain("Difficulty: mixed");
  });

  it("golden: honours the count", () => {
    const golden = entry.mock({ ...SAMPLE["quiz.v1"], questionCount: 7 }) as QuizOutput;

    expect(golden.questions).toHaveLength(7);
  });

  it("golden: one option matches the answer verbatim on a multiple choice question", () => {
    const golden = entry.mock(SAMPLE["quiz.v1"]) as QuizOutput;

    for (const question of golden.questions.filter((q) => q.type === "mcq")) {
      expect(question.options).toContain(question.correctAnswer);
      expect(question.options.filter((o) => o === question.correctAnswer)).toHaveLength(1);
    }
  });

  it("golden: answers come from the note, so they are answerable from it", () => {
    const golden = entry.mock(SAMPLE["quiz.v1"]) as QuizOutput;

    for (const question of golden.questions.filter((q) => q.type !== "true_false")) {
      expect(FACTS).toContain(question.correctAnswer);
    }
  });

  it("names the concepts a retry must concentrate on", () => {
    const user =
      entry.build({ ...SAMPLE["quiz.v1"], focusTags: ["Friction", "Mass"] })[1]?.content ?? "";

    expect(user).toContain("Most questions must be about these concepts: Friction, Mass");
  });

  it("golden: a retry's focused concepts are drilled first", () => {
    const golden = entry.mock({
      ...SAMPLE["quiz.v1"],
      questionCount: 2,
      types: ["mcq"],
      focusTags: ["Friction"],
    }) as QuizOutput;

    // The focused line is drawn from the note before any other — determinism is
    // unchanged, only the order the mock drills in moves, as the prompt asks.
    expect(golden.questions[0]?.correctAnswer).toContain("Friction");
  });
});

describe("flashcards.v1", () => {
  const entry = PROMPTS["flashcards.v1"];

  it("asks for exactly the number of cards requested", () => {
    expect(entry.build({ ...SAMPLE["flashcards.v1"], cardCount: 5 })[1]?.content ?? "").toContain(
      "exactly 5 cards",
    );
  });

  it("golden: honours the count", () => {
    const golden = entry.mock({ ...SAMPLE["flashcards.v1"], cardCount: 5 }) as { cards: unknown[] };

    expect(golden.cards).toHaveLength(5);
  });

  it("golden: backs are lines from the note, never invented", () => {
    const golden = entry.mock(SAMPLE["flashcards.v1"]) as {
      cards: { front: string; back: string }[];
    };

    expect(golden.cards.length).toBeGreaterThan(0);
    for (const card of golden.cards) {
      expect(FACTS).toContain(card.back);
      expect(card.front.endsWith("?")).toBe(true);
    }
  });
});

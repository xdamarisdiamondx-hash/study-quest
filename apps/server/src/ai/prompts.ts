/**
 * Prompt registry (P6): versioned prompts, their output schemas, and their model tiers.
 *
 * A prompt lives here and nowhere else, which is what makes three things possible at once:
 * results can be cached against a `prompt_version` (ADR-008), structured outputs can be
 * validated against one schema (ADR-009), and the mock provider can replay a golden answer
 * for every prompt without a network call.
 *
 * Prompts are written for small models: one job, explicit format, explicit length limit
 * (ADR-025 — the default prompts are tuned to keep token counts, and therefore cost, low).
 */

import type { AiKind, ExplainStyle, SummaryLength, SummaryFormat } from "@sq/core/schemas/ai";
import type { ChatMessage } from "./types.ts";
import { z } from "zod";

import { flashcardOutputSchema, quizOutputSchema } from "@sq/core/schemas/ai";
import { plainText } from "@sq/core/markdown";

/** How expensive a model this prompt wants. Selects the default model per provider. */
export type ModelTier = "fast" | "capable";

export interface SummaryInput {
  title: string;
  bodyMd: string;
  length: SummaryLength;
  format: SummaryFormat;
  topicName?: string;
}

export interface ExplainInput {
  text: string;
  context?: string;
  style: ExplainStyle;
  topicName?: string;
}

export interface QuizInput {
  title: string;
  bodyMd: string;
  questionCount: number;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  types: ("mcq" | "true_false" | "short_answer")[];
  topicName?: string;
  /** Concepts a retry concentrates on — the concepts the student just missed (PRD §13). */
  focusTags?: string[];
}

export interface FlashcardInput {
  title: string;
  bodyMd: string;
  cardCount: number;
  topicName?: string;
}

/** Inputs keyed by prompt key. */
export interface PromptInput {
  "summary.v1": SummaryInput;
  "explain.v1": ExplainInput;
  "quiz.v1": QuizInput;
  "flashcards.v1": FlashcardInput;
}

/** The stable key — also what the cache records as `prompt_version`. */
export type PromptKey = keyof PromptInput;

/** A single prompt entry. */
export interface PromptEntry<K extends PromptKey = PromptKey> {
  /** Stable key — also what the cache records as `prompt_version`. */
  readonly key: K;
  readonly kind: AiKind;
  readonly tier: ModelTier;
  /** `undefined` means free-form text (ADR-009). */
  readonly schema?: z.ZodTypeAny;
  /** Build a chat message stack for a given input. */
  build(input: PromptInput[K]): ChatMessage[];
  /** Deterministic golden answer for the mock provider and the prompt test suite. */
  mock(input: PromptInput[K]): unknown;
}

/* --- shared prompt helpers --------------------------------------------- */

const LENGTH_WORDS: Record<SummaryLength, string> = {
  quick: "at most 60 words",
  standard: "at most 150 words",
  detailed: "at most 400 words",
};

const FORMAT_RULES: Record<SummaryFormat, string> = {
  paragraph: "Write one flowing paragraph.",
  bullets: "Write bullet points, one idea per line, each line starting with a hyphen.",
  key_points: "Write short labelled lines in the form 'Point — explanation'.",
  exam_style:
    "Write exam-style notes: brief fragments under short ALL-CAPS sub-headings, no full sentences.",
};

const STYLE_RULES: Record<ExplainStyle, string> = {
  simple:
    "Use plain language and one idea at a time. No jargon unless you define it in the same sentence.",
  step_by_step: "Build up in numbered steps, each step resting on the one before it.",
  example: "Work through one concrete example from start to finish, naming each step.",
  real_life: "Anchor it in something from everyday life first, then connect back to the idea.",
  beginner: "Assume the reader has never met this subject. Define every term before you use it.",
};

function noteBlock(input: { title: string; bodyMd: string; topicName?: string }): string {
  const text = plainText(input.bodyMd).slice(0, 12_000);
  const where = input.topicName ? `Topic: ${input.topicName}\n` : "";
  return `${where}Title: ${input.title || "Untitled notes"}\n\n${text}`;
}

/**
 * Concepts to ask about, taken from the note itself.
 *
 * Deriving them from the source rather than inventing them is what keeps a generated quiz
 * about the student's material instead of about the model's idea of the subject.
 */
function concepts(bodyMd: string, limit: number): string[] {
  const lines = plainText(bodyMd)
    .split("\n")
    .map((l) => l.replace(/^[#>\-*\d.)\s]+/, "").trim())
    .filter((l) => l.length >= 8 && l.length <= 90);

  const unique: string[] = [];
  for (const line of lines) {
    if (!unique.some((u) => u.toLowerCase() === line.toLowerCase())) unique.push(line);
    if (unique.length >= limit) break;
  }
  return unique;
}

/* --- entries ------------------------------------------------------------ */

const summary: PromptEntry<"summary.v1"> = {
  key: "summary.v1",
  kind: "summary",
  tier: "fast",
  build: (input) => [
    {
      role: "system",
      content:
        "You summarise a student's own notes for revision. Use only what is in the notes — never add facts that are not there. If the notes are too thin to summarise, say so in one line.",
    },
    {
      role: "user",
      content: [
        `Summarise these notes.`,
        `Length: ${input.length} (${LENGTH_WORDS[input.length]}).`,
        `Format: ${input.format}. ${FORMAT_RULES[input.format]}`,
        "",
        noteBlock(input),
      ].join("\n"),
    },
  ],
  mock: (input) => {
    const lines = concepts(
      input.bodyMd,
      input.length === "quick" ? 3 : input.length === "standard" ? 5 : 8,
    );
    const facts = lines.length > 0 ? lines : [`${input.title || "These notes"} — reviewed.`];
    if (input.format === "paragraph") return facts.join(". ").replace(/\.$/, "");
    if (input.format === "key_points")
      return facts.map((f) => `${f} — the idea to remember.`).join("\n");
    if (input.format === "exam_style") {
      return [`KEY POINTS`, ...facts.map((f) => `- ${f}`)].join("\n");
    }
    return facts.map((f) => `- ${f}`).join("\n");
  },
};

const explain: PromptEntry<"explain.v1"> = {
  key: "explain.v1",
  kind: "explain",
  tier: "fast",
  build: (input) => [
    {
      role: "system",
      content:
        "You explain one idea to a student who is stuck. Explain only what was asked. Keep it under 180 words. Where the notes say something relevant, use their wording.",
    },
    {
      role: "user",
      content: [
        `Explain this in a ${input.style.replace(/_/g, "-")} way. ${STYLE_RULES[input.style]}`,
        "",
        `What the student does not understand: ${input.text}`,
        input.context
          ? `\nTheir notes for context:\n${plainText(input.context).slice(0, 6_000)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ],
  mock: (input) =>
    [
      `${input.text} is the part to understand.`,
      STYLE_RULES[input.style],
      "In short: read the note's own words first, then say them back in your own.",
    ].join("\n\n"),
};

const quiz: PromptEntry<"quiz.v1"> = {
  key: "quiz.v1",
  kind: "quiz",
  tier: "capable",
  schema: quizOutputSchema,
  build: (input) => [
    {
      role: "system",
      content: [
        "You write multiple-choice, true/false and short-answer questions from a student's notes.",
        "Every question must be answerable from the notes alone.",
        "For multiple choice, exactly one option equals correctAnswer verbatim.",
        "Give each question a two or three word conceptTag, and a one-sentence explanation of the answer.",
        'Return a JSON object: { "title": string, "questions": [{ "type", "prompt", "options", "correctAnswer", "explanation", "difficulty", "conceptTag" }] }.',
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Write exactly ${input.questionCount} questions.`,
        `Difficulty: ${input.difficulty}.`,
        `Types to use: ${input.types.join(", ")}.`,
        `For true/false, options are ["True", "False"]. For short answer, options is [].`,
        ...(input.focusTags?.length
          ? [`Most questions must be about these concepts: ${input.focusTags.join(", ")}.`]
          : []),
        "",
        noteBlock(input),
      ].join("\n"),
    },
  ],
  mock: (input) => {
    // The whole note supplies seeds, not just as many lines as there are questions: a
    // retry's focus can name any concept in the source, and a count-sized cap made that
    // only true of the first few lines. Without focusTags the order is unchanged —
    // questions still take the note's first lines in document order.
    const pool = concepts(input.bodyMd, 20);
    // A retry's focused concepts come first, so the mock drills them the way the
    // prompt asks the model to — determinism is unchanged either way.
    const focused = (input.focusTags ?? [])
      .filter(Boolean)
      .flatMap((tag) => pool.filter((line) => line.toLowerCase().includes(tag.toLowerCase())));
    const seeds = [...new Set([...focused, ...pool])];
    const questions = Array.from({ length: input.questionCount }, (_, i) => {
      const type = input.types[i % input.types.length] ?? "mcq";
      const seed = seeds[i % Math.max(seeds.length, 1)] ?? `${input.title} point ${i + 1}`;
      const difficulty =
        input.difficulty === "mixed"
          ? (["easy", "medium", "hard"] as const)[i % 3]
          : input.difficulty;

      if (type === "true_false") {
        return {
          type,
          prompt: `True or false: ${seed}`,
          options: ["True", "False"],
          correctAnswer: "True",
          explanation: `The notes state this directly.`,
          difficulty,
          conceptTag: conceptTag(seed),
        };
      }
      if (type === "short_answer") {
        return {
          type,
          prompt: `In one phrase, what do the notes say about: ${seed}?`,
          options: [],
          correctAnswer: seed,
          explanation: `Taken from the notes: ${seed}`,
          difficulty,
          conceptTag: conceptTag(seed),
        };
      }
      return {
        type,
        prompt: `Which statement matches the notes on: ${seed}?`,
        options: [seed, `${seed} (not in the notes)`, "None of these", "All of these"],
        correctAnswer: seed,
        explanation: `The notes say exactly this.`,
        difficulty,
        conceptTag: conceptTag(seed),
      };
    });

    return { title: input.title || "Practice quiz", questions };
  },
};

const flashcards: PromptEntry<"flashcards.v1"> = {
  key: "flashcards.v1",
  kind: "flashcards",
  tier: "capable",
  schema: flashcardOutputSchema,
  build: (input) => [
    {
      role: "system",
      content: [
        "You turn a student's notes into flashcards: one fact per card, question on the front, the answer on the back.",
        "Fronts are short (under 12 words), backs are one or two sentences drawn from the notes.",
        'Return a JSON object: { "title": string, "cards": [{ "front", "back" }] }.',
      ].join(" "),
    },
    {
      role: "user",
      content: `Write exactly ${input.cardCount} cards from these notes.\n\n${noteBlock(input)}`,
    },
  ],
  mock: (input) => {
    const seeds = concepts(input.bodyMd, input.cardCount);
    const cards = Array.from({ length: input.cardCount }, (_, i) => {
      const seed = seeds[i % Math.max(seeds.length, 1)] ?? `${input.title} — fact ${i + 1}`;
      return { front: `What should you remember about: ${shorten(seed)}?`, back: seed };
    });
    return { title: input.title || "Flashcards", cards };
  },
};

function conceptTag(seed: string): string {
  return seed
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .slice(0, 3)
    .join(" ")
    .toLowerCase()
    .slice(0, 80);
}

function shorten(text: string, max = 60): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/* --- registry ------------------------------------------------------------ */

export const PROMPTS = {
  "summary.v1": summary,
  "explain.v1": explain,
  "quiz.v1": quiz,
  "flashcards.v1": flashcards,
} as const satisfies Record<string, PromptEntry>;

export function getPrompt(key: PromptKey): PromptEntry {
  return PROMPTS[key] as PromptEntry;
}

/* --- input validation schemas (re-exported for routes) ------------------ */

export {
  explainStyleSchema,
  summariseFormatSchema,
  summariseLengthSchema,
  quizOutputSchema,
  flashcardOutputSchema,
} from "@sq/core/schemas/ai";

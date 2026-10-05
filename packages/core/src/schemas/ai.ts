/**
 * Shared Zod contracts for the AI layer (P6, ADR-009, ADR-010).
 *
 * All structured AI outputs are validated against these schemas server-side before
 * they are stored or returned. Free-form summaries and explanations are plain text.
 */
import { z } from "zod";

/* --- quiz generation --------------------------------------------------- */

export const quizQuestionSchema = z.object({
  /** Multiple-choice question. */
  type: z.enum(["mcq", "true_false"]),
  prompt: z.string().min(5).max(600),
  options: z.array(z.string().min(1).max(300)).min(2).max(4),
  correctAnswer: z.string().min(1).max(300),
  explanation: z.string().max(500).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  conceptTag: z.string().max(80).optional(),
});
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

export const quizOutputSchema = z.object({
  title: z.string().min(1).max(120),
  questions: z.array(quizQuestionSchema).min(1).max(20),
});
export type QuizOutput = z.infer<typeof quizOutputSchema>;

/** Request body for quiz generation. */
export const generateQuizSchema = z.object({
  noteId: z.string().uuid(),
  questionCount: z.number().int().min(3).max(20).default(10),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
  types: z.array(z.enum(["mcq", "true_false"])).min(1).default(["mcq"]),
});
export type GenerateQuiz = z.infer<typeof generateQuizSchema>;

/* --- flashcard generation ---------------------------------------------- */

export const flashcardSchema = z.object({
  front: z.string().min(1).max(300),
  back: z.string().min(1).max(600),
});
export type Flashcard = z.infer<typeof flashcardSchema>;

export const flashcardOutputSchema = z.object({
  title: z.string().min(1).max(120),
  cards: z.array(flashcardSchema).min(1).max(60),
});
export type FlashcardOutput = z.infer<typeof flashcardOutputSchema>;

/** Request body for flashcard generation. */
export const generateFlashcardsSchema = z.object({
  noteId: z.string().uuid(),
  cardCount: z.number().int().min(3).max(60).default(15),
});
export type GenerateFlashcards = z.infer<typeof generateFlashcardsSchema>;

/* --- summary ----------------------------------------------------------- */

export const summariseLengthSchema = z.enum(["quick", "standard", "detailed"]);
export type SummaryLength = z.infer<typeof summariseLengthSchema>;

export const summariseFormatSchema = z.enum(["paragraph", "bullets", "key_points", "exam_style"]);
export type SummaryFormat = z.infer<typeof summariseFormatSchema>;

export const generateSummarySchema = z.object({
  noteId: z.string().uuid(),
  length: summariseLengthSchema.default("standard"),
  format: summariseFormatSchema.default("bullets"),
});
export type GenerateSummary = z.infer<typeof generateSummarySchema>;

/* --- explain ----------------------------------------------------------- */

export const explainStyleSchema = z.enum([
  "simple",
  "step_by_step",
  "example",
  "real_life",
  "beginner",
]);
export type ExplainStyle = z.infer<typeof explainStyleSchema>;

export const generateExplainSchema = z.object({
  /** Text to explain. Either selected text or a topic name. */
  text: z.string().min(1).max(2000),
  /** Optional context (the note body) to ground the explanation. */
  context: z.string().max(8000).optional(),
  style: explainStyleSchema.default("simple"),
});
export type GenerateExplain = z.infer<typeof generateExplainSchema>;

/* --- request/response schemas (P6) ------------------------------------- */

/** Every AI request carries these fields. */
export const aiRequestSchema = z.object({
  messages: z.array(
    z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string() })
  ),
  json: z.boolean().default(false),
  temperature: z.number().default(0.5),
  maxTokens: z.number().int().optional(),
  signal: z.any().optional(),
});
export type AiRequest = z.infer<typeof aiRequestSchema>;

/** The result of one provider call (ADR-006). */
export const aiResultSchema = z.object({
  text: z.string(),
  model: z.string(),
  tokensIn: z.number().int().default(0),
  tokensOut: z.number().int().default(0),
  latencyMs: z.number().int().nonnegative().default(0),
});
export type AiResult = z.infer<typeof aiResultSchema>;

/** Reported by health(). */
export const aiHealthSchema = z.object({
  ok: z.boolean(),
  provider: z.string(),
  model: z.string().optional(),
  detail: z.string().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
});
export type AiHealth = z.infer<typeof aiHealthSchema>;

/** Provider names, matching the .env setting. */
export const aiProviderNameSchema = z.enum(["ollama", "gemini", "groq", "openaiCompat", "mock"]);
export type AiProviderName = z.infer<typeof aiProviderNameSchema>;

/** Settings stored per profile (ADR-023). */
export const aiSettingsSchema = z.object({
  provider: aiProviderNameSchema.default("groq"),
  model: z.string().max(120).default(""),
  apiKey: z.string().max(400).optional(),
  enabled: z.boolean().default(true),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;

/* --- AI artifact kinds ------------------------------------------------- */

export type AiKind = "summary" | "quiz" | "flashcards" | "explain";
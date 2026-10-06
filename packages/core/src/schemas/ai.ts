/**
 * Shared Zod contracts for the AI layer (P6, ADR-009, ADR-010).
 *
 * All structured AI outputs are validated against these schemas server-side before
 * they are stored or returned. Free-form summaries and explanations are plain text.
 */
import { z } from "zod";

/* --- quiz generation --------------------------------------------------- */

/** Fields every generated question carries, regardless of type. */
const questionMeta = {
  prompt: z.string().min(5).max(600),
  explanation: z.string().max(500).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  conceptTag: z.string().max(80).optional(),
};

/**
 * One generated question, as a discriminated union: a choice question needs 2–4
 * options, while a short answer has none (the prompt asks the model for `[]`). One
 * flat shape could not say both without pretending every question offers a choice.
 */
export const quizQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mcq"),
    ...questionMeta,
    options: z.array(z.string().min(1).max(300)).min(2).max(4),
    correctAnswer: z.string().min(1).max(300),
  }),
  z.object({
    type: z.literal("true_false"),
    ...questionMeta,
    options: z.array(z.string().min(1).max(300)).min(2).max(4),
    correctAnswer: z.string().min(1).max(300),
  }),
  z.object({
    type: z.literal("short_answer"),
    ...questionMeta,
    /** Display-only here; the prompt tells the model to return none. */
    options: z.array(z.string().max(300)).max(4).default([]),
    correctAnswer: z.string().min(1).max(300),
  }),
]);
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

/** The question types a composer can ask for (PRD section 11). */
export const quizTypeSchema = z.enum(["mcq", "true_false", "short_answer"]);
export type QuizType = z.infer<typeof quizTypeSchema>;

export const quizOutputSchema = z.object({
  title: z.string().min(1).max(120),
  questions: z.array(quizQuestionSchema).min(1).max(20),
});
export type QuizOutput = z.infer<typeof quizOutputSchema>;

/**
 * Request body for quiz generation (P8, POST /api/quizzes).
 *
 * The source is exactly one of a note, a topic, or another quiz: `retryOf` names the
 * quiz whose mistakes produced this one, and the server derives both the source
 * material and the focus concepts from it (PRD section 13).
 */
export const generateQuizSchema = z
  .object({
    noteId: z.string().uuid().optional(),
    topicId: z.string().uuid().optional(),
    retryOf: z.string().uuid().optional(),
    questionCount: z.number().int().min(3).max(20).default(10),
    difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
    types: z.array(quizTypeSchema).min(1).default(["mcq"]),
    /** Concepts to concentrate on; a retry sets this from the concepts it missed. */
    focusTags: z.array(z.string().min(1).max(80)).max(6).optional(),
  })
  .refine((d) => Boolean(d.noteId ?? d.topicId ?? d.retryOf), {
    message: "noteId, topicId or retryOf is required",
  });
export type GenerateQuiz = z.infer<typeof generateQuizSchema>;

/* --- quiz attempts (P8) ------------------------------------------------ */

export const quizAnswerSubmissionSchema = z.object({
  questionId: z.string().uuid(),
  /** The chosen option's text, or the student's own wording for a short answer. */
  answer: z.string().max(600).default(""),
  /** Settles a `needs_review` short answer — see core/quiz's gradeAnswer. */
  selfMark: z.enum(["correct", "incorrect"]).optional(),
});
export type QuizAnswerSubmission = z.infer<typeof quizAnswerSubmissionSchema>;

export const submitQuizAttemptSchema = z.object({
  /** May be empty: questions with no submitted answer grade as unanswered. */
  answers: z.array(quizAnswerSubmissionSchema),
  /** Wall-clock time on the runner, pauses excluded (P8 results screen). */
  durationMs: z.number().int().min(0).max(86_400_000).default(0),
});
export type SubmitQuizAttempt = z.infer<typeof submitQuizAttemptSchema>;

/* --- flashcard generation (P9) ------------------------------------------ */

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

/**
 * Request body for deck generation (P9, POST /api/flashcards/generate).
 * Exactly one source — the open note, or every note under a topic — because a
 * deck has one origin: PRD section 14's "connected to the relevant topic"
 * starts being true at generation time.
 */
export const generateDeckSchema = z
  .object({
    noteId: z.string().uuid().optional(),
    topicId: z.string().uuid().optional(),
    cardCount: z.number().int().min(3).max(60).default(15),
  })
  .refine((d) => Boolean(d.noteId) !== Boolean(d.topicId), {
    message: "exactly one of noteId or topicId is required",
  });
export type GenerateDeck = z.infer<typeof generateDeckSchema>;

/* --- deck and card persistence (P9) ------------------------------------- */

/** What a deck is saved as: generated cards, or a hand-built deck's first card. */
export const createDeckSchema = z.object({
  title: z.string().trim().min(1).max(120),
  topicId: z.string().uuid().nullish(),
  sourceNoteId: z.string().uuid().nullish(),
  cards: z.array(flashcardSchema).min(1).max(200),
});
export type CreateDeck = z.infer<typeof createDeckSchema>;

export const cardWriteSchema = z.object({
  front: z.string().trim().min(1).max(300),
  back: z.string().trim().min(1).max(600),
});
export type CardWrite = z.infer<typeof cardWriteSchema>;

/** Editing one card: at least one side must be sent, or the patch is a no-op. */
export const patchCardSchema = cardWriteSchema
  .partial()
  .refine((d) => Boolean(d.front ?? d.back), { message: "front or back is required" });
export type PatchCard = z.infer<typeof patchCardSchema>;

export const importCardsSchema = z.object({
  /** Pasted `front<TAB>back` (or `::`) lines — see core/flashcards parseImport. */
  text: z.string().trim().min(1).max(200_000),
});
export type ImportCards = z.infer<typeof importCardsSchema>;

/* --- reviews (P9) -------------------------------------------------------- */

/** The stored rating vocabulary (plan section 18); button labels live in core. */
export const ratingSchema = z.enum(["again", "hard", "good", "easy"]);
export type CardRating = z.infer<typeof ratingSchema>;

export const reviewSubmissionSchema = z.object({
  cardId: z.string().uuid(),
  rating: ratingSchema,
  /** Seconds on the card, front shown to rating — kept with the rating. */
  durationMs: z.number().int().min(0).max(3_600_000).default(0),
});
export type ReviewSubmission = z.infer<typeof reviewSubmissionSchema>;

export const submitReviewsSchema = z.object({
  /** One study session's id: re-posting the same batch cannot apply twice. */
  batchId: z.string().uuid(),
  reviews: z.array(reviewSubmissionSchema).min(1).max(200),
});
export type SubmitReviews = z.infer<typeof submitReviewsSchema>;

/** GET /api/flashcards/due — the queue behind "review 20 now". */
export const dueQuerySchema = z.object({
  deckId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});
export type DueQuery = z.infer<typeof dueQuerySchema>;

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
    z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string() }),
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

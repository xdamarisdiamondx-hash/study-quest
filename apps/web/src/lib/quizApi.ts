/**
 * Typed client for the quiz API (P8).
 *
 * Shape follows `aiApi`: its own fetching, messages written for the screen that shows
 * them. What this client never sees is how an answer grades — the server grades once at
 * submit time and hands back verdicts, so a quiz taken here cannot be argued with.
 */
import type { QuizType } from "@sq/core/schemas/ai";

import { ApiError } from "./subjectsApi";

/** One question as the taking screen receives it — never with the answer attached. */
export interface QuizQuestionView {
  id: string;
  orderIndex: number;
  type: QuizType;
  prompt: string;
  options: string[];
  difficulty: "easy" | "medium" | "hard";
  conceptTag: string | null;
}

export interface QuizSummary {
  id: string;
  title: string;
  questionCount: number;
  difficulty: string;
  topicId: string | null;
  sourceNoteId: string | null;
  /** The quiz whose mistakes produced this one — a retry, PRD §13. */
  retryOf: string | null;
  focusTags: string[];
  createdAt: string;
  /** Every attempt, oldest first, for the trend line. */
  attempts: QuizAttemptStub[];
}

export interface QuizAttemptStub {
  id: string;
  score: number;
  total: number;
  durationMs: number;
  mode: string;
  completedAt: string | null;
}

/** The full quiz: summary fields plus its questions. */
export interface QuizView extends QuizSummary {
  questions: QuizQuestionView[];
}

export interface GenerateQuizBody {
  noteId?: string;
  topicId?: string;
  retryOf?: string;
  questionCount?: number;
  difficulty?: "easy" | "medium" | "hard" | "mixed";
  types?: QuizType[];
  focusTags?: string[];
  /** Bypass the cache — a second press of Generate should not re-serve the same quiz. */
  fresh?: boolean;
}

/** What the server stores for one graded answer. */
export interface StoredAnswer {
  questionId: string;
  answer: string;
  verdict: "correct" | "incorrect" | "needs_review";
  correct: boolean;
}

/** One line of the results review: what was asked, given, and judged. */
export interface ReviewRow extends QuizQuestionView {
  answer: string;
  verdict: "correct" | "incorrect" | "needs_review";
  correct: boolean;
  correctAnswer: string;
  explanation: string | null;
}

export interface AttemptResult {
  attempt: {
    id: string;
    score: number;
    total: number;
    durationMs: number;
    mode: string;
    completedAt: string | null;
    answers: StoredAnswer[];
  };
  review: ReviewRow[];
  /** PRD §12's "Needs Review", worst first. */
  weak: { conceptTag: string; missed: number; total: number }[];
  /** Concepts whose mastery this attempt moved. */
  mastery: { conceptTag: string; mastery: number; attempts: number; correct: number }[];
  /** On a retry: the attempt it is trying to beat. */
  comparison: { original: { score: number; total: number } } | null;
}

/**
 * A short answer the rules could not settle (P8).
 *
 * The server grades first and answers with these instead of storing anything: keyword
 * overlap found some of the reference but not all, so the student decides — and until
 * they do, nothing is written and no mastery moves. `correctAnswer` is included because
 * comparing against it is exactly how the student decides.
 */
export interface PendingRow {
  questionId: string;
  prompt: string;
  type: QuizType;
  answer: string;
  correctAnswer: string;
  explanation: string | null;
}

/** What one submit call can answer: results, or questions that need a human verdict. */
export type SubmitOutcome = { pending: PendingRow[] } | AttemptResult;

export function isPending(outcome: SubmitOutcome): outcome is { pending: PendingRow[] } {
  return "pending" in outcome;
}

export interface QuizListScope {
  subjectId?: string;
  topicId?: string;
}

async function request<T>(
  path: string,
  init?: RequestInit,
  message = "The quiz request failed",
): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  }).catch(() => {
    throw new ApiError("The server is not answering.", 0);
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      message?: string;
      issues?: string[];
    } | null;
    const detail = body?.message ?? body?.issues?.join(" ") ?? null;
    throw new ApiError(detail ? `${message}: ${detail}` : message, res.status);
  }
  return res.json() as Promise<T>;
}

export const quizApi = {
  /**
   * Generate and store a quiz in one call (POST /api/quizzes).
   *
   * One call rather than "generate, show, then save" because a quiz the client could
   * rewrite before the run would be graded against answers it had already seen.
   */
  generate: (body: GenerateQuizBody) =>
    request<{ quiz: QuizView }>(
      "/api/quizzes",
      { method: "POST", body: JSON.stringify(body) },
      "Quiz generation failed",
    ),

  /** GET /api/quizzes?subjectId=&topicId= — quizzes with their attempt history. */
  list: (scope: QuizListScope = {}) => {
    const params = new URLSearchParams();
    if (scope.subjectId) params.set("subjectId", scope.subjectId);
    if (scope.topicId) params.set("topicId", scope.topicId);
    const query = params.toString();
    return request<{ quizzes: QuizSummary[] }>(
      query ? `/api/quizzes?${query}` : "/api/quizzes",
      undefined,
      "Quizzes could not be loaded",
    );
  },

  /** GET /api/quizzes/:id — questions without answers, plus past attempts. */
  get: (id: string) =>
    request<{ quiz: QuizView }>(
      `/api/quizzes/${encodeURIComponent(id)}`,
      undefined,
      "The quiz could not be loaded",
    ),

  /**
   * POST /api/quizzes/:id/attempts — grade and store, returning the full results:
   * per-question verdicts, weak concepts, mastery deltas and, on a retry, the
   * comparison it needs to show an improvement.
   *
   * May answer `{pending}` instead — short answers the rules could not settle, to be
   * confirmed and re-submitted. Nothing is stored until then.
   */
  submit: (
    id: string,
    body: {
      answers: { questionId: string; answer: string; selfMark?: "correct" | "incorrect" }[];
      durationMs: number;
    },
  ) =>
    request<SubmitOutcome>(
      `/api/quizzes/${encodeURIComponent(id)}/attempts`,
      { method: "POST", body: JSON.stringify(body) },
      "The quiz could not be marked",
    ),
};

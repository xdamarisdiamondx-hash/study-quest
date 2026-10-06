/**
 * The run state machine behind both quiz surfaces (P8): take → mark → results.
 *
 * The note editor and the subject's Quizzes tab render different homes around it, but
 * the transitions are identical, so they live here once — a generated or fetched quiz
 * becomes a run, a submit either lands as results or comes back with short answers to
 * confirm, a retry replaces the quiz with a focused one. Two copies of this would be
 * two places for "what happens after submit" to disagree, which is precisely the drift
 * the phase's single-grade-path rule exists to prevent.
 */
import { useState } from "react";

import type { AttemptResult, PendingRow, QuizView, SubmitOutcome } from "../../lib/quizApi";
import { isPending } from "../../lib/quizApi";
import { useGenerateQuiz, useSubmitAttempt } from "../../lib/useQuizzes";
import { clearQuizDraft } from "./QuizRunner";

/** `idle` is the surface's home — the editor's composer, the tab's list. */
export type QuizPhase = "idle" | "taking" | "marking" | "results";

export interface RunSubmission {
  answers: { questionId: string; answer: string }[];
  durationMs: number;
}

export function useQuizRun() {
  const [phase, setPhase] = useState<QuizPhase>("idle");
  const [quiz, setQuiz] = useState<QuizView | null>(null);
  const [pending, setPending] = useState<PendingRow[] | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  /** The run as submitted — kept so pending short answers can be re-posted with marks. */
  const [submission, setSubmission] = useState<RunSubmission | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const generate = useGenerateQuiz();
  const submit = useSubmitAttempt(quiz?.id ?? "");

  /** Open a quiz to take: one that was just generated, fetched from the list, or resumed. */
  const take = (next: QuizView) => {
    setQuiz(next);
    setPending(null);
    setResult(null);
    setSubmission(null);
    setActionError(null);
    setPhase("taking");
  };

  /**
   * Post the run. Either the server answers with results, or with the short answers it
   * could not settle — in which case nothing is stored yet and the marking stage shows.
   * Rejection propagates: the runner keeps the quiz open and shows the message.
   */
  const submitRun = async (body: RunSubmission): Promise<SubmitOutcome> => {
    setActionError(null);
    setSubmission(body);
    const outcome = await submit.mutateAsync(body);
    if (isPending(outcome)) {
      setPending(outcome.pending);
      setPhase("marking");
    } else {
      setResult(outcome);
      setPhase("results");
    }
    return outcome;
  };

  /** Re-post the run with the student's own verdicts folded into the undecided answers. */
  const mark = async (selfMarks: Record<string, "correct" | "incorrect">) => {
    if (!submission || !quiz) return;
    setActionError(null);
    try {
      const outcome = await submit.mutateAsync({
        answers: submission.answers.map((a) => {
          const verdict = selfMarks[a.questionId];
          return verdict ? { ...a, selfMark: verdict } : a;
        }),
        durationMs: submission.durationMs,
      });
      if (isPending(outcome)) setPending(outcome.pending);
      else {
        // The attempt is stored now — the recovery draft has done its job.
        clearQuizDraft(quiz.id);
        setResult(outcome);
        setPhase("results");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Your marks could not be saved.");
    }
  };

  /**
   * Build the focused retry (PRD §13): five questions on the concepts the results just
   * flagged, generated from the original's own source — the server derives both, so the
   * only thing chosen here is what to retry.
   */
  const retry = async () => {
    if (!quiz) return;
    setActionError(null);
    const types = [...new Set(quiz.questions.map((q) => q.type))];
    const difficulty =
      quiz.difficulty === "easy" || quiz.difficulty === "medium" || quiz.difficulty === "hard"
        ? quiz.difficulty
        : "mixed";
    try {
      const r = await generate.mutateAsync({
        retryOf: quiz.id,
        questionCount: 5,
        difficulty,
        types: types.length > 0 ? types : ["mcq"],
      });
      // A retry is a fresh run — never resume the previous one's half-finished draft.
      clearQuizDraft(r.quiz.id);
      take(r.quiz);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "The retry could not be generated.");
    }
  };

  /** Same questions, fresh clock: drop the draft and start over. */
  const retake = () => {
    if (!quiz) return;
    clearQuizDraft(quiz.id);
    setPending(null);
    setResult(null);
    setSubmission(null);
    setActionError(null);
    setPhase("taking");
  };

  /**
   * Back to the surface's home. The quiz is kept — the editor uses it to offer Resume
   * when an exited run still has a draft; the tab fetches fresh from its list anyway.
   */
  const leave = () => setPhase("idle");

  return {
    phase,
    quiz,
    pending,
    result,
    actionError,
    submitting: submit.isPending,
    retrying: generate.isPending,
    take,
    submitRun,
    mark,
    retry,
    retake,
    leave,
  };
}

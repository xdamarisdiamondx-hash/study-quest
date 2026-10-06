/**
 * Quiz runner (P8): theatre mode, one question per screen.
 *
 * It takes the whole viewport because taking a quiz is the one study activity that
 * should not compete with the rest of the page: a dim backdrop, a progress bar, and the
 * keyboard doing the work — 1–4 to answer, ←/→ to move, F to flag, Enter to continue,
 * Esc to pause.
 *
 * State is preserved in both senses the plan asks for. Pause keeps everything in
 * memory behind an overlay; leaving (or closing the tab) writes a draft to
 * sessionStorage, so reopening the quiz resumes exactly where it stopped — same
 * question, same answers, same clock. Submitting clears the draft: once the server has
 * graded, the draft would only be a way to take the quiz twice on one record.
 *
 * The runner never sees an answer key. It posts what the student said and the server
 * replies with verdicts (or with short answers needing the student's own verdict) —
 * grading lives in exactly one place, and this is not it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Chip } from "@sq/ui";
import type { QuizType } from "@sq/core/schemas/ai";

import { isPending, type QuizView, type SubmitOutcome } from "../../lib/quizApi";

export interface QuizDraft {
  index: number;
  answers: Record<string, string>;
  flagged: Record<string, boolean>;
  elapsedMs: number;
}

const draftKey = (quizId: string) => `sq-quiz-draft:${quizId}`;

/** The saved progress of an unfinished run, or null when there is none to resume. */
export function readQuizDraft(quizId: string): QuizDraft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(quizId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<QuizDraft>;
    const draft: QuizDraft = {
      index: Number(parsed.index) || 0,
      answers: parsed.answers ?? {},
      flagged: parsed.flagged ?? {},
      elapsedMs: Number(parsed.elapsedMs) || 0,
    };
    // A draft that holds no progress is not a resumable run — dev's double-mounted
    // effects write one, and claiming "answers restored" over an untouched quiz would
    // be a lie.
    const started =
      draft.index > 0 ||
      Object.keys(draft.answers).length > 0 ||
      Object.keys(draft.flagged).length > 0;
    return started ? draft : null;
  } catch {
    // A corrupt draft is not a reason the quiz cannot start.
    return null;
  }
}

export function clearQuizDraft(quizId: string): void {
  try {
    sessionStorage.removeItem(draftKey(quizId));
  } catch {
    // Storage may be unavailable; the quiz still runs, it just cannot resume.
  }
}

const TYPE_LABEL: Record<QuizType, string> = {
  mcq: "Multiple choice",
  true_false: "True or false",
  short_answer: "Short answer",
};

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export interface QuizRunnerProps {
  quiz: QuizView;
  /**
   * Post the run. Resolves with whatever the server answered — results, or short
   * answers awaiting the student's own verdict; the parent changes phase either way
   * and this component unmounts. Rejecting leaves the runner open with the message.
   */
  submit: (body: {
    answers: { questionId: string; answer: string }[];
    durationMs: number;
  }) => Promise<SubmitOutcome>;
  /** Save-and-close from the pause overlay: the draft is already written. */
  onExit: () => void;
}

export function QuizRunner({ quiz, submit, onExit }: QuizRunnerProps) {
  const questions = quiz.questions;
  const [restored] = useState(() => readQuizDraft(quiz.id));
  const [index, setIndex] = useState(() => Math.min(restored?.index ?? 0, questions.length - 1));
  const [answers, setAnswers] = useState<Record<string, string>>(restored?.answers ?? {});
  const [flagged, setFlagged] = useState<Record<string, boolean>>(restored?.flagged ?? {});
  const [elapsedMs, setElapsedMs] = useState(restored?.elapsedMs ?? 0);
  const [paused, setPaused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = questions[Math.min(index, questions.length - 1)];
  /* A started-once clock. The base is claimed lazily inside the first read rather
     than in `useRef(Date.now())`: render stays pure, and the value is only ever read
     from handlers and the interval — never during render itself. */
  const startedAtRef = useRef(0);
  const pausedTotalRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  /* Latest run state, mirrored after every render so the unmount and beforeunload
     writers below can be registered once and still see the run as it stands. Refs in
     an effect — never written during render, which is the rule that keeps them from
     going stale in the first place. */
  const stateRef = useRef({ index, answers, flagged, elapsedMs });
  useEffect(() => {
    stateRef.current = { index, answers, flagged, elapsedMs };
  });

  const currentElapsed = useCallback(() => {
    if (startedAtRef.current === 0) {
      startedAtRef.current = Date.now() - (restored?.elapsedMs ?? 0);
    }
    return Date.now() - startedAtRef.current - pausedTotalRef.current;
  }, [restored]);

  const saveDraft = () => {
    if (finishedRef.current) return;
    try {
      // State, not refs: `saveDraft` is only ever called from click and key handlers,
      // which already close over the latest render — no ref mirror needed.
      const draft: QuizDraft = { index, answers, flagged, elapsedMs };
      sessionStorage.setItem(draftKey(quiz.id), JSON.stringify(draft));
    } catch {
      // Draft persistence is best-effort; the run itself is not affected.
    }
  };

  /* The clock runs only while the quiz is running — pauses do not count against the
     time shown on the results screen. */
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setElapsedMs(currentElapsed()), 500);
    return () => window.clearInterval(id);
  }, [paused, currentElapsed]);

  /* Leaving for any reason keeps the run: pause-exit writes it explicitly (above), and
     this covers the paths that give no warning — closing the tab, the editor closing
     underneath, a route change. A submitted run skips it: the draft would only be a way
     to take the same quiz twice on one record. */
  useEffect(() => {
    const persist = () => {
      if (finishedRef.current) return;
      try {
        sessionStorage.setItem(draftKey(quiz.id), JSON.stringify(stateRef.current));
      } catch {
        // Draft persistence is best-effort; the run itself is not affected.
      }
    };
    window.addEventListener("beforeunload", persist);
    return () => {
      window.removeEventListener("beforeunload", persist);
      persist();
    };
  }, [quiz.id]);

  const answer = (questionId: string, value: string) =>
    setAnswers((prev) => ({ ...prev, [questionId]: value }));

  const toggleFlag = (questionId: string) =>
    setFlagged((prev) => ({ ...prev, [questionId]: !prev[questionId] }));

  const go = (delta: number) =>
    setIndex((i) => Math.min(Math.max(i + delta, 0), questions.length - 1));

  const pause = () => {
    pausedAtRef.current = Date.now();
    setPaused(true);
    saveDraft();
  };

  const resume = () => {
    if (pausedAtRef.current !== null) {
      pausedTotalRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
    setPaused(false);
  };

  const exit = () => {
    saveDraft();
    onExit();
  };

  const send = async () => {
    const unanswered = questions.filter((q) => !(answers[q.id] ?? "").trim()).length;
    if (
      unanswered > 0 &&
      !confirm(
        `${unanswered} question${unanswered === 1 ? " is" : "s are"} unanswered — submit anyway? Unanswered questions are marked wrong.`,
      )
    )
      return;

    setSubmitting(true);
    setError(null);
    try {
      const outcome = await submit({
        answers: questions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? "" })),
        durationMs: Math.round(currentElapsed()),
      });
      if (isPending(outcome)) {
        // Nothing is stored until the student settles the undecided answers, so the
        // draft stays: abandoning the marking screen must still leave a way back.
        setSubmitting(false);
        return;
      }
      finishedRef.current = true;
      clearQuizDraft(quiz.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The quiz could not be submitted.");
      setSubmitting(false);
    }
  };

  /* Keyboard: registered every render so no handler can go stale mid-run. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.tagName === "TEXTAREA" || target?.tagName === "INPUT";

      if (e.key === "Escape") {
        e.preventDefault();
        if (paused) resume();
        else pause();
        return;
      }
      if (paused || submitting || typing || !current) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (index === questions.length - 1) void send();
        else go(1);
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleFlag(current.id);
      } else if (/^[1-4]$/.test(e.key)) {
        const option = current.options[Number(e.key) - 1];
        if (option) {
          e.preventDefault();
          answer(current.id, option);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const flagCount = Object.values(flagged).filter(Boolean).length;
  const progress = ((index + 1) / Math.max(questions.length, 1)) * 100;

  if (!current) return null;

  return createPortal(
    <div
      className="sq-quiz-stage"
      role="dialog"
      aria-modal="true"
      aria-label={`Quiz: ${quiz.title}`}
    >
      <div className="sq-quiz-frame">
        <header className="sq-quiz-top">
          <div
            className="sq-quiz-bar"
            role="progressbar"
            aria-valuenow={index + 1}
            aria-valuemin={1}
            aria-valuemax={questions.length}
            aria-label="Quiz progress"
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="sq-quiz-meta">
            <span className="sq-quiz-count">
              Question {index + 1} of {questions.length}
            </span>
            <span className="sq-quiz-clock">{clock(elapsedMs)}</span>
            {restored && !submitting && <Chip tone="neutral">Answers restored</Chip>}
            {flagCount > 0 && <Chip tone="warn">{flagCount} flagged</Chip>}
            <Button size="sm" variant="secondary" onClick={pause} disabled={submitting}>
              Pause
            </Button>
          </div>
        </header>

        <main className="sq-quiz-question">
          <div className="sq-quiz-tags">
            <Chip tone="neutral">{TYPE_LABEL[current.type]}</Chip>
            <Chip tone="neutral">{current.difficulty}</Chip>
            {current.conceptTag && <Chip tone="neutral">{current.conceptTag}</Chip>}
          </div>
          <h2>{current.prompt}</h2>

          {current.options.length > 0 ? (
            <div className="sq-quiz-options" role="group" aria-label="Answers">
              {current.options.map((option, i) => (
                <button
                  key={option}
                  type="button"
                  className={`sq-quiz-option ${answers[current.id] === option ? "sq-quiz-option-on" : ""}`}
                  aria-pressed={answers[current.id] === option}
                  disabled={submitting}
                  onClick={() => answer(current.id, option)}
                >
                  <span className="sq-quiz-letter" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>{option}</span>
                </button>
              ))}
            </div>
          ) : (
            <textarea
              className="sq-input sq-quiz-textarea"
              rows={4}
              value={answers[current.id] ?? ""}
              disabled={submitting}
              placeholder="Answer in your own words — the marking compares meaning, not phrasing."
              onChange={(e) => answer(current.id, e.target.value)}
            />
          )}

          <Button
            size="sm"
            variant={flagged[current.id] ? "primary" : "secondary"}
            disabled={submitting}
            onClick={() => toggleFlag(current.id)}
          >
            {flagged[current.id] ? "Flagged for review" : "Flag for review"}
          </Button>
        </main>

        <footer className="sq-quiz-foot">
          <span className="sq-quiz-hint">
            1–4 answer · ← → move · F flag · Enter next · Esc pause
          </span>
          <div className="sq-quiz-nav">
            <Button
              variant="secondary"
              size="sm"
              disabled={index === 0 || submitting}
              onClick={() => go(-1)}
            >
              Back
            </Button>
            {index < questions.length - 1 ? (
              <Button variant="secondary" size="sm" disabled={submitting} onClick={() => go(1)}>
                Next
              </Button>
            ) : (
              <Button onClick={() => void send()} disabled={submitting}>
                {submitting ? "Marking…" : "Submit quiz"}
              </Button>
            )}
          </div>
        </footer>

        {error && (
          <p className="sq-error sq-quiz-error" role="alert">
            {error}
          </p>
        )}

        {paused && (
          <div className="sq-quiz-pause">
            <div className="sq-quiz-pause-card" role="dialog" aria-label="Quiz paused">
              <h3>Paused</h3>
              <p>
                Your answers and the clock are kept exactly as they are. Leave, and they will be
                here when you come back.
              </p>
              <div className="sq-quiz-actions">
                <Button onClick={resume}>Resume</Button>
                <Button variant="secondary" onClick={exit}>
                  Save and close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

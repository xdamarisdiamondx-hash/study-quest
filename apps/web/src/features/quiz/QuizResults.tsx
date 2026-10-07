/**
 * After the run (P8): the student's own verdicts, then the results — PRD §12.
 *
 * Two stages in one component because they are one conversation: "mark what we could
 * not decide" is simply the first thing the results screen has to say when short
 * answers came back as `needs_review`. Nothing has been stored yet at that point —
 * the reference answer is shown precisely so the student can compare honestly, and
 * their verdict is what gets submitted. Once stored, the screen shows the score,
 * every question with its explanation, the concepts to review, and the way out of the
 * loop: a focused retry on what was actually missed.
 */
import { useState } from "react";
import { Button, Chip, Ring } from "@sq/ui";

import type { AttemptResult, PendingRow, QuizView } from "../../lib/quizApi";

function duration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export interface QuizResultsProps {
  quiz: QuizView;
  /** Short answers awaiting the student's verdict — the marking stage shows instead. */
  pending: PendingRow[] | null;
  /** The stored attempt, once every answer has settled. */
  result: AttemptResult | null;
  /** Re-submit the run with the student's self-marks folded in. */
  onMark: (selfMarks: Record<string, "correct" | "incorrect">) => void;
  marking?: boolean;
  /** Generate the focused retry (5 questions on what was missed). */
  onRetry: () => void;
  retrying?: boolean;
  /** Same questions, fresh clock. */
  onRetake: () => void;
  onClose?: () => void;
  closeLabel?: string;
  /** Generation or submission failure — stated beside the action that failed. */
  error?: string | null;
}

export function QuizResults({
  quiz,
  pending,
  result,
  onMark,
  marking = false,
  onRetry,
  retrying = false,
  onRetake,
  onClose,
  closeLabel = "Done",
  error = null,
}: QuizResultsProps) {
  const [marks, setMarks] = useState<Record<string, "correct" | "incorrect">>({});

  /* --- stage one: settle the undecided short answers --------------------- */

  if (!result && pending && pending.length > 0) {
    const allMarked = pending.every((p) => marks[p.questionId]);
    return (
      <section className="sq-ai-panel" aria-label="Confirm your answers">
        <header className="sq-ai-head">
          <h3>One last mark</h3>
          <div className="sq-ai-head-actions">
            {onClose && (
              <Button size="sm" variant="secondary" onClick={onClose}>
                {closeLabel}
              </Button>
            )}
          </div>
        </header>

        <div className="sq-ai-body">
          <p>
            {pending.length === 1
              ? "One short answer could not be marked automatically. Compare it with the reference answer and say how you did."
              : `${pending.length} short answers could not be marked automatically. Compare each with its reference answer and say how you did.`}
          </p>

          <ul className="sq-quiz-marks">
            {pending.map((row, i) => (
              <li key={row.questionId} className="sq-quiz-mark">
                <span className="sq-quiz-mark-no">{i + 1}</span>
                <div>
                  <p className="sq-quiz-mark-prompt">{row.prompt}</p>
                  <p className="sq-quiz-mark-ref">
                    <strong>Reference:</strong> {row.correctAnswer}
                  </p>
                  <p className="sq-quiz-mark-yours">
                    <strong>You wrote:</strong> {row.answer || "— nothing —"}
                  </p>
                  <div className="sq-quiz-actions">
                    <Button
                      size="sm"
                      variant={marks[row.questionId] === "correct" ? "primary" : "secondary"}
                      aria-pressed={marks[row.questionId] === "correct"}
                      disabled={marking}
                      onClick={() => setMarks((m) => ({ ...m, [row.questionId]: "correct" }))}
                    >
                      I was correct
                    </Button>
                    <Button
                      size="sm"
                      variant={marks[row.questionId] === "incorrect" ? "primary" : "secondary"}
                      aria-pressed={marks[row.questionId] === "incorrect"}
                      disabled={marking}
                      onClick={() => setMarks((m) => ({ ...m, [row.questionId]: "incorrect" }))}
                    >
                      I was wrong
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <footer className="sq-ai-foot">
          <span className="sq-ai-foot-meta">
            {allMarked
              ? "All marked — the score is calculated next."
              : "Mark each answer to continue."}
          </span>
          <div className="sq-ai-actions">
            {error && <span className="sq-error">{error}</span>}
            <Button size="sm" disabled={!allMarked || marking} onClick={() => onMark(marks)}>
              {marking ? "Marking…" : "See results"}
            </Button>
          </div>
        </footer>
      </section>
    );
  }

  if (!result) {
    /* Neither stage has data yet — the orchestrator only renders this component
       once one of them exists, so this is a defensive blank rather than a state. */
    return null;
  }

  /* --- stage two: the results (PRD §12) ---------------------------------- */

  const { attempt, review, weak, mastery, comparison } = result;
  const pct = attempt.total > 0 ? Math.round((attempt.score / attempt.total) * 100) : 0;
  const missedEverything = weak.length === 0;

  return (
    <section className="sq-ai-panel" aria-label="Quiz results">
      <header className="sq-ai-head">
        <h3>{quiz.title}</h3>
        {attempt.mode === "retry" && <Chip tone="neutral">Retry</Chip>}
        <div className="sq-ai-head-actions">
          {onClose && (
            <Button size="sm" variant="secondary" onClick={onClose}>
              {closeLabel}
            </Button>
          )}
        </div>
      </header>

      {/* The score and the review scroll as one body, exactly like the summary panel:
          the panel has a fixed height in the editor's main area, so only the footer is
          pinned. */}
      <div className="sq-ai-body">
        <div className="sq-quiz-score">
          <Ring value={pct} label="Quiz score" />
          <div className="sq-quiz-score-text">
            <strong className="sq-quiz-score-line">
              {attempt.score} / {attempt.total}
            </strong>
            <span className="sq-quiz-score-meta">
              {duration(attempt.durationMs)}
              {attempt.mode === "retry" && quiz.focusTags.length > 0
                ? ` · focused on ${quiz.focusTags.join(", ")}`
                : ""}
            </span>
            {comparison && (
              <span className="sq-quiz-compare">
                Was {comparison.original.score} / {comparison.original.total} —{" "}
                {attempt.score >= comparison.original.score ? "up" : "down"}{" "}
                {Math.abs(attempt.score - comparison.original.score)} on the retry.
              </span>
            )}
          </div>
        </div>

        <div className={`sq-quiz-weak ${missedEverything ? "sq-quiz-weak-clear" : ""}`}>
          <span className="sq-ai-kicker">Needs review</span>
          {missedEverything ? (
            <span>Nothing missed — every question correct.</span>
          ) : (
            <span>{weak.map((w) => `${w.conceptTag} (${w.missed}/${w.total})`).join(" · ")}</span>
          )}
        </div>

        {mastery.length > 0 && (
          <p className="sq-quiz-mastery">
            Concept mastery updated:{" "}
            {mastery.map((m) => `${m.conceptTag} ${Math.round(m.mastery * 100)}%`).join(" · ")}
          </p>
        )}

        {/* P13: the graded attempt is a quest success event — say so here, on the
            screen where the work happened, rather than only on the Quests page. */}
        {result.quest &&
          (result.quest.stepsCompleted > 0 || result.quest.questsCompleted.length > 0) && (
            <div style={{ display: "flex", gap: "var(--s2)", flexWrap: "wrap" }}>
              {result.quest.stepsCompleted > 0 && (
                <Chip tone="ok">
                  Quest step{result.quest.stepsCompleted === 1 ? "" : "s"} done · +
                  {result.quest.xpAwarded} XP
                </Chip>
              )}
              {result.quest.questsCompleted.map((q) => (
                <Chip key={q.id} tone="ok">
                  Quest complete — {q.title} +{q.xp} XP
                </Chip>
              ))}
            </div>
          )}

        <ol className="sq-quiz-review">
          {review.map((row, i) => (
            <li key={row.id} className="sq-quiz-review-item">
              <div className="sq-quiz-review-head">
                <span className="sq-quiz-review-no">{i + 1}</span>
                <Chip tone={row.correct ? "ok" : "bad"}>{row.correct ? "Correct" : "Wrong"}</Chip>
                {row.verdict === "needs_review" && (
                  <Chip tone="neutral">Self-marked {row.correct ? "correct" : "wrong"}</Chip>
                )}
                {row.conceptTag && <Chip tone="neutral">{row.conceptTag}</Chip>}
              </div>
              <p className="sq-quiz-review-prompt">{row.prompt}</p>
              <p
                className={`sq-quiz-review-given ${row.correct ? "" : "sq-quiz-review-given-bad"}`}
              >
                <strong>You said:</strong> {row.answer || "— nothing —"}
              </p>
              {!row.correct && (
                <p className="sq-quiz-review-answer">
                  <strong>Correct answer:</strong> {row.correctAnswer}
                </p>
              )}
              {row.explanation && <p className="sq-quiz-review-why">{row.explanation}</p>}
            </li>
          ))}
        </ol>
      </div>

      <footer className="sq-ai-foot">
        <span className="sq-ai-foot-meta">
          {weak.length > 0 ? "Retry builds 5 questions on what you missed." : "Nothing to retry."}
        </span>
        <div className="sq-ai-actions">
          {error && <span className="sq-error">{error}</span>}
          <Button size="sm" disabled={weak.length === 0 || retrying} onClick={onRetry}>
            {retrying ? "Building…" : "Retry quiz"}
          </Button>
          <Button size="sm" variant="secondary" onClick={onRetake} disabled={retrying}>
            Take again
          </Button>
        </div>
      </footer>
    </section>
  );
}

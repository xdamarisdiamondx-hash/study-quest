/**
 * Quiz panel in the note editor (P8).
 *
 * Owns the whole cycle — compose, take, confirm any undecided short answers, read the
 * results — so the editor only has to decide *when* to show it, exactly like the
 * summary and explain panels beside it. It renders into the editor's main area; the run
 * itself takes the viewport (QuizRunner is a portal), because taking a quiz is the one
 * activity here that should not compete with the rest of the page.
 *
 * Exiting a run is not losing it: the runner writes a draft first, so the compose stage
 * offers Resume whenever an unfinished run survives — same questions, same answers,
 * same clock.
 */
import { Button, IconButton } from "@sq/ui";

import { QuizComposer } from "./QuizComposer";
import { QuizResults } from "./QuizResults";
import { QuizRunner, readQuizDraft } from "./QuizRunner";
import { useQuizRun } from "./useQuizRun";

export interface QuizPanelProps {
  noteId: string;
  noteTitle: string;
  sourceWords: number;
  onClose: () => void;
}

export function QuizPanel({ noteId, noteTitle, sourceWords, onClose }: QuizPanelProps) {
  const run = useQuizRun();
  const sourceName = noteTitle.trim() || "Untitled note";

  // Read during render, not in an effect: a phase change re-renders anyway, and the
  // draft's presence is what decides whether Resume exists.
  const resume = run.phase === "idle" && run.quiz && readQuizDraft(run.quiz.id) ? run.quiz : null;

  return (
    <>
      {run.phase === "taking" && run.quiz && (
        <QuizRunner key={run.quiz.id} quiz={run.quiz} submit={run.submitRun} onExit={run.leave} />
      )}

      {run.phase === "marking" || run.phase === "results" ? (
        run.quiz && (
          <QuizResults
            quiz={run.quiz}
            pending={run.pending}
            result={run.result}
            onMark={(marks) => void run.mark(marks)}
            marking={run.submitting}
            onRetry={() => void run.retry()}
            retrying={run.retrying}
            onRetake={run.retake}
            onClose={run.leave}
            closeLabel={run.phase === "results" ? "New quiz" : "Quit"}
            error={run.actionError}
          />
        )
      ) : (
        <section className="sq-ai-panel" aria-label="Quiz">
          <header className="sq-ai-head">
            <h3>Quiz</h3>
            <div className="sq-ai-head-actions">
              <IconButton onClick={onClose} title="Back to the note" aria-label="Back to the note">
                ✕
              </IconButton>
            </div>
          </header>

          <QuizComposer source={{ kind: "note", noteId }} onGenerated={run.take} />

          <div className="sq-ai-source">
            <span className="sq-ai-kicker">Grounded in</span>
            <span>
              {sourceName} · {sourceWords} words
            </span>
          </div>

          <div className="sq-ai-body" aria-live="polite">
            {resume && (
              <p className="sq-quiz-resume">
                <strong>{resume.title}</strong> was left unfinished — resume it, or generate a new
                one below.{" "}
                <Button size="sm" variant="secondary" onClick={() => run.take(resume)}>
                  Resume
                </Button>
              </p>
            )}
            <p className="sq-ai-empty">
              Pick a size and the question types you want, then generate. Every question comes from
              this note alone, and the marking happens once, on the server, when you submit.
            </p>
          </div>

          <footer className="sq-ai-foot">
            <span className="sq-ai-foot-meta">
              {run.quiz ? `Last quiz: ${run.quiz.title}` : "Nothing generated yet"}
            </span>
          </footer>
        </section>
      )}
    </>
  );
}

/**
 * Quiz composer (P8, PRD §11): question count, types, difficulty — then generate.
 *
 * Shared by the note editor (source: this note) and the subject's Quizzes tab (source:
 * a topic), because the choices are identical and the two must not drift apart. What it
 * cannot do is edit the generated questions before the run: the server grades what it
 * stored, so a quiz the composer could rewrite would be marked against answers it had
 * already seen. A wrong quiz is discarded and regenerated, never corrected in place.
 *
 * Generation feedback is a moving bar with the real request behind it — the model call
 * is the wait, so pretending to a percentage would be a guess. A failure leaves the
 * button exactly where it was: the error below is information, not a lockout.
 */
import { useState } from "react";
import { Button, Picker } from "@sq/ui";
import type { QuizType } from "@sq/core/schemas/ai";

import type { QuizView } from "../../lib/quizApi";
import { useGenerateQuiz } from "../../lib/useQuizzes";
import { AiAvailabilityNotice, useAiAvailability } from "../study/AiAvailability";

/** Where the questions come from — the caller owns the source and states it on screen. */
export type QuizComposerSource =
  { kind: "note"; noteId: string } | { kind: "topic"; topicId: string };

const COUNTS = [5, 10, 15, 20];

const TYPES: { value: QuizType; label: string }[] = [
  { value: "mcq", label: "Multiple choice" },
  { value: "true_false", label: "True / false" },
  { value: "short_answer", label: "Short answer" },
];

const DIFFICULTIES = [
  { value: "mixed", label: "Mixed" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const TYPE_LABEL: Record<QuizType, string> = {
  mcq: "multiple choice",
  true_false: "true/false",
  short_answer: "short answer",
};

export interface QuizComposerProps {
  source: QuizComposerSource;
  onGenerated: (quiz: QuizView) => void;
}

export function QuizComposer({ source, onGenerated }: QuizComposerProps) {
  const [count, setCount] = useState(10);
  const [types, setTypes] = useState<QuizType[]>(["mcq"]);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("mixed");
  const generate = useGenerateQuiz();
  const availability = useAiAvailability();

  const toggleType = (value: QuizType) => {
    setTypes((current) => {
      if (current.includes(value)) {
        // At least one type must survive — a quiz of nothing is not a choice.
        return current.length > 1 ? current.filter((t) => t !== value) : current;
      }
      return [...current, value];
    });
  };

  const run = () => {
    generate
      .mutateAsync({
        questionCount: count,
        difficulty,
        types,
        // A press wants *a* quiz, not last press's quiz — bypass the cache (ADR-008).
        fresh: true,
        ...(source.kind === "note" ? { noteId: source.noteId } : { topicId: source.topicId }),
      })
      .then((r) => onGenerated(r.quiz))
      .catch(() => {
        // The message renders below; the button stays live for the next press.
      });
  };

  const running = generate.isPending;
  const error = generate.error instanceof Error ? generate.error.message : null;

  return (
    <div className="sq-ai-composer">
      <Picker
        label="Questions"
        value={String(count)}
        options={COUNTS.map((n) => ({ value: String(n), label: `${n}` }))}
        onChange={(v) => setCount(Number(v) || 10)}
        disabled={running}
      />
      <Picker
        label="Difficulty"
        value={difficulty}
        options={DIFFICULTIES.map((d) => ({ value: d.value, label: d.label }))}
        onChange={(v) => setDifficulty((v as "easy" | "medium" | "hard" | "mixed") ?? "mixed")}
        disabled={running}
      />

      {/* A labelled div rather than fieldset/legend: flex layout of a legend is
          browser-specific, and `role="group"` carries the same meaning. */}
      <div className="sq-quiz-types" role="group" aria-label="Question types">
        <span className="sq-label">Question types</span>
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            className={`sq-quiz-type ${types.includes(t.value) ? "sq-quiz-type-on" : ""}`}
            aria-pressed={types.includes(t.value)}
            disabled={running}
            onClick={() => toggleType(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="sq-ai-composer-run">
        {/* Not disabled after a failure: a transient provider error should not take the
            button away from the student who wants to try again. */}
        <Button size="sm" onClick={run} disabled={running || availability !== "ready"}>
          {running ? "Generating…" : "Generate quiz"}
        </Button>
      </div>

      {running && (
        <div className="sq-quiz-progress" role="status" aria-label="Generating questions">
          <span />
        </div>
      )}

      <p className="sq-ai-composer-preview">
        <strong>{count} questions</strong> ·{" "}
        <strong>{DIFFICULTIES.find((d) => d.value === difficulty)?.label}</strong> —{" "}
        {types.map((t) => TYPE_LABEL[t]).join(", ")}.
      </p>

      <AiAvailabilityNotice availability={availability} />
      {error && <p className="sq-error">{error}</p>}
    </div>
  );
}

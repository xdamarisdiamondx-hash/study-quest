/**
 * Quizzes tab (P8): compose a quiz from a topic, and the history of every quiz taken.
 *
 * It draws no page furniture of its own — SubjectDetailPage owns the header and tab bar,
 * same as the Notes panel beside it. What it owns is the whole phase: the composer at
 * the top (source: a topic, so its notes are the ground truth), the run when one is
 * open, and below them the history — quizzes grouped under their topic, each group
 * carrying a sparkline of every attempt so a rising or falling trend is visible without
 * opening anything (PRD §12's history with trend).
 *
 * The run itself is shared with the note editor (`useQuizRun`): one state machine, one
 * grade path, two homes.
 */
import { useState } from "react";
import { Button, Card, Chip, EmptyState, Picker } from "@sq/ui";
import type { Topic } from "@sq/core/schemas/subjects";

import type { QuizSummary } from "../../lib/quizApi";
import { quizApi } from "../../lib/quizApi";
import { useQuizList } from "../../lib/useQuizzes";
import { QuizComposer } from "./QuizComposer";
import { QuizResults } from "./QuizResults";
import { QuizRunner } from "./QuizRunner";
import { useQuizRun } from "./useQuizRun";

interface QuizzesPanelProps {
  subjectId: string;
  /** Passed in rather than fetched — the page around the panel already holds them. */
  topics: Topic[];
}

const pct = (score: number, total: number) => (total > 0 ? Math.round((score / total) * 100) : 0);

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** One group's attempts as a trend line — oldest left, newest right. */
function Spark({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const w = 104;
  const h = 24;
  const xy = values.map((v, i) => {
    const x = 2 + (i / (values.length - 1)) * (w - 4);
    const y = h - 2 - (Math.max(0, Math.min(100, v)) / 100) * (h - 4);
    return { x, y };
  });
  const last = xy[xy.length - 1];
  return (
    <svg
      className="sq-spark"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={label}
    >
      <polyline
        points={xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {last && <circle cx={last.x} cy={last.y} r="2" fill="currentColor" />}
    </svg>
  );
}

/** Quizzes under their own topic, in the subject's topic order; unfiled ones last. */
function buildGroups(quizzes: QuizSummary[], topics: Topic[]) {
  const groups = topics.map((t) => ({ key: t.id, name: t.name, quizzes: [] as QuizSummary[] }));
  const unfiled = { key: "", name: "No topic", quizzes: [] as QuizSummary[] };
  for (const quiz of quizzes) {
    const group = (quiz.topicId ? groups.find((g) => g.key === quiz.topicId) : null) ?? unfiled;
    group.quizzes.push(quiz);
  }
  return [
    ...groups.filter((g) => g.quizzes.length > 0),
    ...(unfiled.quizzes.length > 0 ? [unfiled] : []),
  ];
}

export function QuizzesPanel({ subjectId, topics }: QuizzesPanelProps) {
  const list = useQuizList({ subjectId });
  const run = useQuizRun();
  const [topicPick, setTopicPick] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  // Self-healing: a picked topic that was deleted falls back to the first one.
  const activeTopic = topics.find((t) => t.id === topicPick) ?? topics[0] ?? null;

  const open = async (quizId: string) => {
    setOpening(quizId);
    setOpenError(null);
    try {
      const { quiz } = await quizApi.get(quizId);
      run.take(quiz);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : "The quiz could not be loaded.");
    } finally {
      setOpening(null);
    }
  };

  if (run.phase === "marking" || run.phase === "results") {
    if (!run.quiz) return null;
    return (
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
        closeLabel="Back to quizzes"
        error={run.actionError}
      />
    );
  }

  const groups = buildGroups(list.data?.quizzes ?? [], topics);

  return (
    <>
      {run.phase === "taking" && run.quiz && (
        <QuizRunner key={run.quiz.id} quiz={run.quiz} submit={run.submitRun} onExit={run.leave} />
      )}

      <Card title="Quizzes">
        {topics.length === 0 ? (
          <EmptyState
            title="No topics yet"
            hint="A quiz is generated from a topic's notes, so the topic comes first."
          />
        ) : (
          <>
            <div style={{ maxWidth: 320 }}>
              <Picker
                label="From topic"
                value={activeTopic?.id ?? ""}
                options={topics.map((t) => ({ value: t.id, label: t.name }))}
                onChange={setTopicPick}
                hint="Questions come from every note filed under this topic."
                disabled={run.retrying}
              />
            </div>

            {activeTopic && (
              <QuizComposer
                source={{ kind: "topic", topicId: activeTopic.id }}
                onGenerated={run.take}
              />
            )}

            {list.error ? (
              // A div, not a p: `.sq-card > p` outranks `.sq-error` and would grey the message out.
              <div className="sq-error" role="alert">
                {list.error.message}
              </div>
            ) : null}
            {openError ? (
              <div className="sq-error" role="alert">
                {openError}
              </div>
            ) : null}

            {list.isLoading ? (
              <p className="sq-help">Loading quizzes…</p>
            ) : groups.length === 0 ? (
              <EmptyState
                monogram="?"
                title="No quizzes yet"
                hint="Generate the first one above — it will appear here with its results once taken."
              />
            ) : (
              <div className="sq-quiz-history">
                {groups.map((group) => {
                  const attempts = group.quizzes
                    .flatMap((q) => q.attempts)
                    .filter((a) => a.completedAt)
                    .sort(
                      (a, b) => Date.parse(a.completedAt ?? "0") - Date.parse(b.completedAt ?? "0"),
                    );
                  return (
                    <section key={group.key || "unfiled"} className="sq-quiz-group">
                      <header className="sq-quiz-group-head">
                        <h4>{group.name}</h4>
                        <span className="sq-quiz-group-meta">
                          {group.quizzes.length} quiz{group.quizzes.length === 1 ? "" : "zes"} ·{" "}
                          {attempts.length} attempt{attempts.length === 1 ? "" : "s"}
                        </span>
                        <Spark
                          values={attempts.map((a) => pct(a.score, a.total))}
                          label={`${group.name}: attempt trend, ${attempts.length} attempts`}
                        />
                      </header>

                      <ul className="sq-quiz-list">
                        {group.quizzes.map((quiz) => {
                          const scores = quiz.attempts.map((a) => pct(a.score, a.total));
                          const best = quiz.attempts.reduce<QuizSummary["attempts"][number] | null>(
                            (top, a) => (!top || a.score > top.score ? a : top),
                            null,
                          );
                          const bestPct = best ? pct(best.score, best.total) : null;
                          return (
                            <li key={quiz.id} className="sq-quiz-row">
                              <div className="sq-quiz-row-main">
                                <b>{quiz.title}</b>
                                <div className="sq-quiz-row-meta">
                                  <Chip tone="neutral">{quiz.questionCount} questions</Chip>
                                  <Chip tone="neutral">{quiz.difficulty}</Chip>
                                  {quiz.retryOf && <Chip tone="neutral">Retry</Chip>}
                                  {best && (
                                    <Chip
                                      tone={bestPct! >= 70 ? "ok" : bestPct! >= 40 ? "warn" : "bad"}
                                    >
                                      best {best.score}/{best.total}
                                    </Chip>
                                  )}
                                  <span className="sq-quiz-row-when">
                                    {shortDate(quiz.createdAt)}
                                  </span>
                                </div>
                              </div>
                              <div className="sq-quiz-row-side">
                                <Spark
                                  values={scores}
                                  label={`${quiz.title}: ${quiz.attempts.length} attempts`}
                                />
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={opening === quiz.id}
                                  onClick={() => void open(quiz.id)}
                                >
                                  {opening === quiz.id
                                    ? "Opening…"
                                    : quiz.attempts.length > 0
                                      ? "Take again"
                                      : "Take"}
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}

/**
 * One subject, with its topics (P4).
 *
 * The tab set is the shape the rest of the app grows into: every tab is real — Overview
 * through Flashcards as of P4–P9, Tasks as of P11 — each panel drawing only its own
 * slice while this page owns the header and tab bar.
 */
import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Card, EmptyState, Monogram, Ring, TabPanel, Tabs, type TabItem } from "@sq/ui";
import { dayKey } from "@sq/core/gamification";
import type { TopicStatus } from "@sq/core/schemas/subjects";

import { useProgress } from "../../lib/useProgress";
import { useScrollToFocus } from "../../lib/useFocus";
import { useSubjectTopics } from "../../lib/useSubjects";
import { TrendChart, seriesDays } from "../progress/charts";
import { TopicComposer, TopicRow } from "./TopicRow";
import { NotesPanel } from "./NotesPanel";
import { QuizzesPanel } from "../quiz/QuizzesPanel";
import { FlashcardsPanel } from "../flashcards/FlashcardsPanel";
import { TasksPanel } from "../tasks/TasksPanel";

const TABS: TabItem[] = [
  { id: "overview", label: "Overview" },
  { id: "topics", label: "Topics" },
  { id: "notes", label: "Notes" },
  { id: "quizzes", label: "Quizzes" },
  { id: "flashcards", label: "Flashcards" },
  { id: "tasks", label: "Tasks" },
];

export function SubjectDetailPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const store = useSubjectTopics(subjectId);
  // The tab lives in the URL (P13) so a quest step can deep-link to the quizzes
  // or flashcards tab; unknown values fall back to Overview instead of blanking.
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("tab");
  const tab = requestedTab && TABS.some((t) => t.id === requestedTab) ? requestedTab : "overview";
  // The topics tab outlines and centres the topic a search result pointed at
  // (P19) — ready once this subject's topics have actually loaded.
  const focusId = params.get("focus");
  useScrollToFocus(focusId, tab === "topics" && store.status !== "loading");
  function setTab(next: string) {
    const nextParams = new URLSearchParams(params);
    if (next === "overview") nextParams.delete("tab");
    else nextParams.set("tab", next);
    setParams(nextParams, { replace: true });
  }
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // P16: this subject's study minutes over the shared 90-day window, sliced
  // to 30 or 90 for the trend line (PRD plan: "trend over 30/90 days").
  const [rangeDays, setRangeDays] = useState<30 | 90>(30);
  const progress = useProgress();

  function onTopicDrop(targetId: string) {
    const from = store.topics.findIndex((t) => t.id === dragId);
    const to = store.topics.findIndex((t) => t.id === targetId);
    setDragId(null);
    setOverId(null);
    if (from < 0 || to < 0 || from === to) return;
    void store.moveTopic(from, to);
  }

  const counts = useMemo(() => {
    const tally: Record<TopicStatus, number> = {
      not_started: 0,
      learning: 0,
      mastered: 0,
    };
    for (const t of store.topics) tally[t.status as TopicStatus] += 1;
    return tally;
  }, [store.topics]);

  if (store.status === "loading") {
    return (
      <div className="sq-col" style={{ marginTop: "var(--s6)" }}>
        <Card>
          <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>Loading…</p>
        </Card>
      </div>
    );
  }

  if (!store.subject) {
    return (
      <div className="sq-col" style={{ marginTop: "var(--s6)" }}>
        <Card>
          <EmptyState
            title="Subject not found"
            hint={store.error ?? "It may have been deleted, or it belongs to another account."}
            action={
              <Link to="/study" className="sq-btn sq-btn-primary">
                Back to subjects
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const subject = store.subject;

  // The window maths runs client-side from the server's own window keys, so
  // the subject line and the Progress page's heatmap can't disagree about
  // which days are in range; quiet days are filled at zero by seriesDays.
  const win = progress.data?.study.window;
  const subjectDays = progress.data?.study.bySubject.find((s) => s.id === subject.id)?.days ?? [];
  const trendFrom =
    win && rangeDays > 1
      ? dayKey(new Date(Date.parse(`${win.to}T00:00:00Z`) - (rangeDays - 1) * 86_400_000))
      : null;
  const trendPoints =
    win && trendFrom
      ? seriesDays(trendFrom, win.to, subjectDays).map((d) => ({ day: d.day, value: d.minutes }))
      : [];
  const trendMax = Math.max(
    60,
    Math.ceil(Math.max(0, ...trendPoints.map((p) => p.value)) / 60) * 60,
  );

  return (
    <div className="sq-col" style={{ marginTop: "var(--s6)" }}>
      <div>
        <Link to="/study" className="sq-label" style={{ textDecoration: "none" }}>
          ← Subjects
        </Link>
        <div className="sq-row" style={{ gap: "var(--s4)", marginTop: "var(--s2)" }}>
          <Monogram text={subject.monogram} active large />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                font: "var(--t-h1)",
                margin: 0,
                color: "var(--strong)",
                letterSpacing: "-.025em",
              }}
            >
              {subject.name}
            </h1>
            <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
              {subject.topicCount} topic{subject.topicCount === 1 ? "" : "s"}
              {subject.archived ? " · archived" : ""}
            </p>
          </div>
          <Ring value={subject.progress * 100} label={`${subject.name} progress`} />
        </div>
      </div>

      {store.error ? (
        <p className="sq-error" role="alert">
          {store.error}
        </p>
      ) : null}

      <Tabs
        items={TABS.map((t) => (t.id === "topics" ? { ...t, count: subject.topicCount } : t))}
        active={tab}
        onChange={setTab}
        label={`${subject.name} sections`}
      />

      <TabPanel id="overview" active={tab}>
        <Card>
          <div className="sq-row" style={{ gap: "var(--s6)", flexWrap: "wrap" }}>
            <Stat label="Topics" value={String(subject.topicCount)} />
            <Stat label="Not started" value={String(counts.not_started)} />
            <Stat label="Learning" value={String(counts.learning)} />
            <Stat label="Mastered" value={String(counts.mastered)} />
          </div>
          <p style={{ marginTop: "var(--s5)", color: "var(--muted)", font: "var(--t-body-sm)" }}>
            Progress is the weighted mix of topic mastery, review coverage, study minutes and quest
            completion from the shared formula — all four inputs read from real activity as of P16,
            recomputed on each read.
          </p>
        </Card>

        <Card
          title="Study trend"
          action={
            <span className="sq-row" style={{ gap: "var(--s1)" }}>
              <button
                type="button"
                className={`sq-btn sq-btn-sm ${rangeDays === 30 ? "sq-btn-secondary" : "sq-btn-ghost"}`}
                aria-pressed={rangeDays === 30}
                onClick={() => setRangeDays(30)}
              >
                30 days
              </button>
              <button
                type="button"
                className={`sq-btn sq-btn-sm ${rangeDays === 90 ? "sq-btn-secondary" : "sq-btn-ghost"}`}
                aria-pressed={rangeDays === 90}
                onClick={() => setRangeDays(90)}
              >
                90 days
              </button>
            </span>
          }
        >
          {progress.isPending ? (
            <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
              Loading study minutes…
            </p>
          ) : subjectDays.length === 0 ? (
            <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
              No sessions for this subject yet — the line appears after your first one.
            </p>
          ) : (
            <>
              <TrendChart
                points={trendPoints}
                label={`${subject.name} study minutes per day, last ${rangeDays} days`}
                max={trendMax}
                unit="m"
                columnLabel="Minutes"
                emptyText="No study minutes in this range yet."
              />
              <p
                style={{ margin: "var(--s2) 0 0", color: "var(--muted)", font: "var(--t-body-sm)" }}
              >
                Minutes come from the session log; a day without a session plots at zero.
              </p>
            </>
          )}
        </Card>
      </TabPanel>

      <TabPanel id="topics" active={tab}>
        <Card
          title="Topics"
          action={<span className="sq-label">drag or use the arrows to reorder</span>}
        >
          {store.topics.length === 0 ? (
            <EmptyState
              title="No topics yet"
              hint="Topics are the units you actually study and get tested on. Add the first one."
            />
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {store.topics.map((topic, index) => (
                <TopicRow
                  key={topic.id}
                  topic={topic}
                  progress={topic.progress}
                  index={index}
                  total={store.topics.length}
                  busy={store.busy}
                  focused={focusId === topic.id}
                  isDragging={dragId === topic.id}
                  isDropTarget={overId === topic.id && dragId !== topic.id}
                  onDragStart={() => setDragId(topic.id)}
                  onDragOver={() => {
                    if (overId !== topic.id) setOverId(topic.id);
                  }}
                  onDragLeave={() => setOverId((id) => (id === topic.id ? null : id))}
                  onDrop={() => onTopicDrop(topic.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  onMove={(from, to) => void store.moveTopic(from, to)}
                  onStatus={(status) => void store.updateTopic(topic.id, { status })}
                  onRename={(name) => void store.updateTopic(topic.id, { name })}
                  onDelete={() => void store.removeTopic(topic.id)}
                />
              ))}
            </ul>
          )}

          <TopicComposer busy={store.busy} onAdd={(input) => store.createTopic(input)} />
        </Card>
      </TabPanel>

      <TabPanel id="notes" active={tab}>
        <NotesPanel subjectId={subject.id} topics={store.topics} />
      </TabPanel>

      <TabPanel id="quizzes" active={tab}>
        <QuizzesPanel subjectId={subject.id} topics={store.topics} />
      </TabPanel>

      <TabPanel id="flashcards" active={tab}>
        <FlashcardsPanel subjectId={subject.id} topics={store.topics} />
      </TabPanel>

      <TabPanel id="tasks" active={tab}>
        <TasksPanel subjectId={subject.id} />
      </TabPanel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ font: "var(--t-stat)", color: "var(--strong)" }}>{value}</div>
      <div className="sq-label">{label}</div>
    </div>
  );
}

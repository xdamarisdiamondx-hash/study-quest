/**
 * One subject, with its topics (P4).
 *
 * The tab set is the shape the rest of the app will grow into: Overview and Topics are real
 * now, Notes/Quizzes/Flashcards/Tasks are wired to their future phases and say so rather
 * than showing an empty page that looks broken.
 */
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, EmptyState, Monogram, Ring, TabPanel, Tabs, type TabItem } from "@sq/ui";
import type { TopicStatus } from "@sq/core/schemas/subjects";

import { useSubjectTopics } from "../../lib/useSubjects";
import { TopicComposer, TopicRow } from "./TopicRow";
import { NotesPanel } from "./NotesPanel";
import { QuizzesPanel } from "../quiz/QuizzesPanel";

const TABS: TabItem[] = [
  { id: "overview", label: "Overview" },
  { id: "topics", label: "Topics" },
  { id: "notes", label: "Notes" },
  { id: "quizzes", label: "Quizzes" },
  { id: "flashcards", label: "Flashcards", soon: true },
  { id: "tasks", label: "Tasks", soon: true },
];

/** Which phase delivers each tab, so the empty state can be specific. */
const PHASE: Record<string, string> = {
  notes: "P5",
  flashcards: "P9",
  tasks: "P11",
};

export function SubjectDetailPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const store = useSubjectTopics(subjectId);
  const [tab, setTab] = useState("overview");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

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
            completion from the shared formula. Two of those four arrive in later phases, so the
            number will still move as you use the app.
          </p>
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
                  index={index}
                  total={store.topics.length}
                  busy={store.busy}
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

      {TABS.filter((t) => t.soon).map((t) => (
        <TabPanel key={t.id} id={t.id} active={tab}>
          <Card>
            <EmptyState
              title={`${t.label} arrive in ${PHASE[t.id]}`}
              hint={`This tab is already wired up, so it will not move when ${t.label.toLowerCase()} land. Right now there is nothing to show.`}
            />
          </Card>
        </TabPanel>
      ))}
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

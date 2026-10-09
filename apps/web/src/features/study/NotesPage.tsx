/**
 * Standalone notes routes (P5) — /study/:subjectId/notes and /:topicId/notes.
 *
 * This is a page, so it draws the back links and the heading; the notes themselves come
 * from NotesPanel, which the subject's Notes tab renders too. Sharing the panel is what
 * keeps the two from drifting apart — and it is why this route no longer carries its own
 * tab bar, which used to render a second one on top of the subject page's.
 */
import { Link, useParams } from "react-router-dom";
import { Card, EmptyState, Monogram, Ring } from "@sq/ui";

import { useSubjectTopics } from "../../lib/useSubjects";
import { NotesPanel } from "./NotesPanel";

export function NotesPage() {
  const { subjectId, topicId } = useParams<{ subjectId: string; topicId?: string }>();
  const store = useSubjectTopics(subjectId);

  if (store.status === "loading") {
    return (
      <div className="sq-col" style={{ marginTop: "var(--s6)" }}>
        {/* Heading-less for a beat while the subject loads — keep a page h1
            present from the first paint (axe `page-has-heading-one`). */}
        <h1 className="sq-sr-only">Notes</h1>
        <Card>
          <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>Loading…</p>
        </Card>
      </div>
    );
  }

  if (!store.subject) {
    return (
      <div className="sq-col" style={{ marginTop: "var(--s6)" }}>
        <h1 className="sq-sr-only">Notes</h1>
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
  const currentTopic = topicId ? store.topics.find((t) => t.id === topicId) : null;

  return (
    <div className="sq-col" style={{ marginTop: "var(--s6)" }}>
      <div>
        <Link to="/study" className="sq-label" style={{ textDecoration: "none" }}>
          ← Subjects
        </Link>
        <Link
          to={`/study/${subject.id}`}
          className="sq-label"
          style={{ textDecoration: "none", marginTop: "var(--s2)", display: "block" }}
        >
          ← {subject.name}
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
              {currentTopic ? `${subject.name} / ${currentTopic.name}` : subject.name}
            </h1>
            <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
              Notes{currentTopic ? ` in ${currentTopic.name}` : ""}
            </p>
          </div>
          {currentTopic && (
            <Ring value={currentTopic.progressCache * 100} label={`${currentTopic.name} progress`} />
          )}
        </div>
      </div>

      {store.error ? (
        <p className="sq-error" role="alert">
          {store.error}
        </p>
      ) : null}

      {/* Only lock to the topic when it actually resolves, so a stale URL falls back to
          the whole subject rather than stranding the panel on an unknown id. */}
      <NotesPanel subjectId={subject.id} topics={store.topics} topicId={currentTopic?.id} />
    </div>
  );
}

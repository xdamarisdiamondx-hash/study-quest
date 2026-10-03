/**
 * Subject list with full management (P4).
 *
 * Reachable two ways: pointer drag on the row, and the up/down buttons on every card. Both
 * go through the same ordering helper, so the two paths cannot disagree.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, DragHandle, EmptyState, Monogram, ReorderButtons, Ring } from "@sq/ui";

import { useSubjects } from "../../lib/useSubjects";
import { templatesApi, type TemplateSummary } from "../../lib/subjectsApi";
import { SubjectEditor } from "./SubjectEditor";

export function StudyPage() {
  const store = useSubjects();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const liveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void templatesApi()
      .then((d) => setTemplates(d.subjects))
      .catch(() => setTemplates([]));
  }, []);

  const live = useMemo(() => store.subjects.filter((s) => !s.archived), [store.subjects]);
  const archived = useMemo(() => store.subjects.filter((s) => s.archived), [store.subjects]);
  const editingSubject = editing ? (store.subjects.find((s) => s.id === editing) ?? null) : null;

  /* --- drag and drop --------------------------------------------------- */

  function onDrop(targetId: string) {
    const from = live.findIndex((s) => s.id === dragId);
    const to = live.findIndex((s) => s.id === targetId);
    setDragId(null);
    setOverId(null);
    if (from < 0 || to < 0 || from === to) return;
    void store.moveTo(from, to);
  }

  return (
    <div className="sq-col" style={{ marginTop: "var(--s6)" }}>
      <div className="sq-row" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <h1
            style={{
              font: "var(--t-h1)",
              margin: "0 0 var(--s1)",
              color: "var(--strong)",
              letterSpacing: "-.025em",
            }}
          >
            Study
          </h1>
          <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
            {live.length === 0
              ? "Your subjects and topics"
              : `${live.length} subject${live.length === 1 ? "" : "s"} · ${live.reduce(
                  (n, s) => n + s.topicCount,
                  0,
                )} topics`}
          </p>
        </div>
        <Link to="new" className="sq-btn sq-btn-primary">
          Add subject
        </Link>
      </div>

      {store.error ? (
        <p className="sq-error" role="alert">
          {store.error}
        </p>
      ) : null}

      <div ref={liveRef} aria-live="polite">
        {store.status === "loading" ? (
          <Card>
            <p style={{ color: "var(--muted)", font: "var(--t-body-sm)", margin: 0 }}>
              Loading your subjects…
            </p>
          </Card>
        ) : live.length === 0 ? (
          <Card>
            <EmptyState
              monogram="Aa"
              title={archived.length > 0 ? "No active subjects" : "No subjects yet"}
              hint={
                archived.length > 0
                  ? "Everything you have is archived. Restore one below or add a new subject."
                  : "Add a subject, or start from a template with sensible starter topics."
              }
              action={<SubjectCreator />}
            />
          </Card>
        ) : (
          <ul className="sq-subjects" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {live.map((subject, index) => (
              <li key={subject.id}>
                <Card className="sq-subject">
                  <div
                    className="sq-row"
                    style={{ flexWrap: "nowrap", gap: "var(--s4)", alignItems: "center" }}
                    draggable
                    onDragStart={(e) => {
                      setDragId(subject.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (overId !== subject.id) setOverId(subject.id);
                    }}
                    onDragLeave={() => setOverId((id) => (id === subject.id ? null : id))}
                    onDrop={(e) => {
                      e.preventDefault();
                      onDrop(subject.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                    data-dragging={dragId === subject.id}
                    data-drop={overId === subject.id && dragId !== subject.id}
                  >
                    <DragHandle label={subject.name} />
                    <Monogram text={subject.monogram} active />
                    <Link
                      to={`/study/${subject.id}`}
                      style={{ flex: 1, minWidth: 0, color: "inherit", textDecoration: "none" }}
                    >
                      <b style={{ color: "var(--strong)", font: "var(--t-h3)" }}>{subject.name}</b>
                      <div style={{ color: "var(--muted)", font: "var(--t-body-sm)" }}>
                        {subject.topicCount === 0
                          ? "No topics yet"
                          : `${subject.topicCount} topic${subject.topicCount === 1 ? "" : "s"}`}
                      </div>
                    </Link>
                    <Ring value={subject.progress * 100} label={`${subject.name} progress`} small />
                    <ReorderButtons
                      index={index}
                      total={live.length}
                      label={subject.name}
                      onMove={(from, to) => void store.moveTo(from, to)}
                    />
                    <SubjectRowMenu
                      name={subject.name}
                      onEdit={() => setEditing(subject.id)}
                      onArchive={() => void store.setArchived(subject.id, true)}
                      onDelete={() => void store.remove(subject.id)}
                    />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      {archived.length > 0 ? (
        <Card title="Archived" action={<span className="sq-label">{archived.length}</span>}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {archived.map((subject) => (
              <li key={subject.id} className="sq-row" style={{ padding: "var(--s3) 0" }}>
                <Monogram text={subject.monogram} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ color: "var(--muted)" }}>{subject.name}</b>
                  <div style={{ color: "var(--muted)", font: "var(--t-body-sm)" }}>
                    {subject.topicCount} topic{subject.topicCount === 1 ? "" : "s"}
                  </div>
                </div>
                <button
                  type="button"
                  className="sq-btn sq-btn-secondary sq-btn-sm"
                  disabled={store.busy}
                  onClick={() => void store.setArchived(subject.id, false)}
                >
                  Restore
                </button>
                <button
                  type="button"
                  className="sq-btn sq-btn-ghost sq-btn-sm"
                  disabled={store.busy}
                  onClick={() => void store.remove(subject.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {templates.length > 0 && live.length > 0 ? (
        <Card title="Add from a template" action={<span className="sq-label">optional</span>}>
          <div className="sq-row" style={{ flexWrap: "wrap" }}>
            {templates.map((t) => (
              <TemplateButton
                key={t.name}
                name={t.name}
                monogram={t.monogram}
                topicCount={t.topicCount}
                disabled={store.busy}
                onImport={() => void store.importTemplates([t.name])}
              />
            ))}
          </div>
        </Card>
      ) : null}

      {editingSubject ? (
        <SubjectEditor
          subject={editingSubject}
          onClose={() => setEditing(null)}
          onSave={async (name) => {
            await store.rename(editingSubject.id, name);
            setEditing(null);
          }}
          onArchive={async () => {
            await store.setArchived(editingSubject.id, true);
            setEditing(null);
          }}
          onDelete={async () => {
            await store.remove(editingSubject.id);
            setEditing(null);
          }}
          busy={store.busy}
        />
      ) : null}
    </div>
  );
}

function TemplateButton({
  name,
  monogram,
  topicCount,
  disabled,
  onImport,
}: {
  name: string;
  monogram: string;
  topicCount: number;
  disabled: boolean;
  onImport: () => void;
}) {
  return (
    <button type="button" className="sq-chip" disabled={disabled} onClick={onImport}>
      <Monogram text={monogram} />
      <span>
        {name} · {topicCount} topics
      </span>
    </button>
  );
}

/** The create form. Lives inline so the empty state stays a single focusable step. */
function SubjectCreator() {
  const store = useSubjects();
  const [name, setName] = useState("");

  return (
    <form
      className="sq-row"
      style={{ gap: "var(--s2)", justifyContent: "center" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        void store.create(name.trim());
        setName("");
      }}
    >
      <div className="sq-field" style={{ flex: 1, minWidth: "180px", textAlign: "left" }}>
        <label htmlFor="new-subject">Subject name</label>
        <input
          id="new-subject"
          className="sq-input"
          value={name}
          maxLength={80}
          placeholder="e.g. Organic Chemistry"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <button
        type="submit"
        className="sq-btn sq-btn-primary"
        disabled={store.busy || name.trim().length === 0}
        style={{ alignSelf: "flex-end" }}
      >
        Add
      </button>
    </form>
  );
}

/**
 * Per-row actions.
 *
 * Rendered inline rather than in a menu: on a phone these are one tap away, and the actions
 * are few enough that a hidden menu would cost more than it saves.
 */
function SubjectRowMenu({
  name,
  onEdit,
  onArchive,
  onDelete,
}: {
  name: string;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="sq-row" style={{ gap: "var(--s2)" }}>
        <span className="sq-sr-only">Confirm deleting {name}</span>
        <span style={{ color: "var(--muted)", font: "var(--t-body-sm)" }}>Delete {name}?</span>
        <button
          type="button"
          className="sq-btn sq-btn-ghost sq-btn-sm"
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
        <button type="button" className="sq-btn sq-btn-danger sq-btn-sm" onClick={onDelete}>
          Delete
        </button>
      </span>
    );
  }

  return (
    <span className="sq-row" style={{ gap: "var(--s1)" }}>
      <button
        type="button"
        className="sq-btn sq-btn-secondary sq-btn-sm"
        onClick={onEdit}
        aria-label={`Rename ${name}`}
      >
        Rename
      </button>
      <button
        type="button"
        className="sq-btn sq-btn-ghost sq-btn-sm"
        onClick={onArchive}
        aria-label={`Archive ${name}`}
      >
        Archive
      </button>
      <button
        type="button"
        className="sq-btn sq-btn-ghost sq-btn-sm"
        onClick={() => setConfirming(true)}
        aria-label={`Delete ${name}`}
      >
        Delete
      </button>
    </span>
  );
}

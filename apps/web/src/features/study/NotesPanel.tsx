/**
 * Notes panel (P5) — list, create and edit the notes of one subject.
 *
 * It draws no page furniture of its own. SubjectDetailPage already owns the subject header
 * and the tab bar, and NotesPage owns them for the standalone /notes routes; drawing them
 * here as well is what made the Notes tab look like two pages laid over each other, so the
 * panel is only ever the card.
 */
import { useState } from "react";
import { Button, Card, EmptyState, Picker } from "@sq/ui";
import type { Topic } from "@sq/core/schemas/subjects";

import { useNotes, type Note } from "../../lib/useNotes";
import { NoteEditor } from "./NoteEditor";

interface NotesPanelProps {
  subjectId: string;
  /** Passed in rather than fetched — the page around the panel already holds them. */
  topics: Topic[];
  /** Locks the panel to one topic, for the /study/:subjectId/:topicId/notes route. */
  topicId?: string;
}

/**
 * The panel is either showing the list, asking which topic a new note belongs to, or
 * showing the editor.
 *
 * Notes hang off topics, so a subject with more than one topic needs an answer before the
 * editor can open. A topic filter or a single topic settles it, and the question is skipped
 * rather than asked for form's sake.
 */
type View =
  | { kind: "list" }
  | { kind: "pick-topic"; picked: string | null }
  | { kind: "new"; topicId: string }
  | { kind: "edit"; noteId: string };

export function NotesPanel({ subjectId, topics, topicId: lockedTopicId }: NotesPanelProps) {
  const [filter, setFilter] = useState<string | null>(lockedTopicId ?? null);
  const [view, setView] = useState<View>({ kind: "list" });

  const notes = useNotes({ subjectId, topicId: lockedTopicId ?? filter ?? undefined });

  const topicName = (id: string | null) =>
    id ? (topics.find((t) => t.id === id)?.name ?? "Unfiled") : "No topic";

  function startNewNote() {
    const target = lockedTopicId ?? filter;
    if (target) {
      setView({ kind: "new", topicId: target });
      return;
    }
    const [only] = topics;
    if (only && topics.length === 1) {
      setView({ kind: "new", topicId: only.id });
      return;
    }
    setView({ kind: "pick-topic", picked: null });
  }

  if (view.kind === "new") {
    return (
      <Card title="New note">
        <NoteEditor topicId={view.topicId} onClose={() => setView({ kind: "list" })} />
      </Card>
    );
  }

  if (view.kind === "edit") {
    const open = notes.notes.find((note) => note.id === view.noteId);
    return (
      <Card title={open?.title || "Note"}>
        <NoteEditor noteId={view.noteId} onClose={() => setView({ kind: "list" })} />
      </Card>
    );
  }

  if (view.kind === "pick-topic") {
    return (
      <Card title="New note">
        <Picker
          label="Topic"
          value={view.picked}
          placeholder="Choose a topic"
          options={topics.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(value) => setView({ kind: "pick-topic", picked: value })}
          hint="Notes live inside a topic, so pick the one this belongs to."
        />
        <div
          className="sq-row"
          style={{ justifyContent: "flex-end", gap: "var(--s2)", marginTop: "var(--s4)" }}
        >
          <Button variant="secondary" onClick={() => setView({ kind: "list" })}>
            Cancel
          </Button>
          <Button
            disabled={!view.picked}
            onClick={() => view.picked && setView({ kind: "new", topicId: view.picked })}
          >
            Continue
          </Button>
        </div>
      </Card>
    );
  }

  const showTopicFilter = !lockedTopicId && topics.length > 1;
  const showTopicName = showTopicFilter && !filter;
  const count = notes.notes.length;

  return (
    <Card
      title="Notes"
      action={
        topics.length > 0 ? (
          <Button size="sm" onClick={startNewNote}>
            New note
          </Button>
        ) : null
      }
    >
      {showTopicFilter ? (
        <div style={{ maxWidth: 320, marginBottom: "var(--s4)" }}>
          <Picker
            label="Topic"
            value={filter}
            placeholder="All topics"
            options={topics.map((t) => ({ value: t.id, label: t.name }))}
            onChange={setFilter}
          />
        </div>
      ) : null}

      {notes.error ? (
        // A div, not a p: `.sq-card > p` outranks `.sq-error` and would grey the message out.
        <div className="sq-error" role="alert">
          {notes.error}
        </div>
      ) : topics.length === 0 ? (
        <EmptyState
          title="No topics yet"
          hint="Notes hang off topics, so add one in the Topics tab before you start writing."
        />
      ) : notes.isLoading ? (
        <p>Loading notes…</p>
      ) : count === 0 ? (
        <EmptyState
          title="No notes yet"
          hint={
            filter
              ? `Nothing captured for ${topicName(filter)} yet.`
              : "Capture your thoughts, paste from a lecture, or write up a lab report."
          }
        />
      ) : (
        <>
          <p>
            {count} note{count === 1 ? "" : "s"}
          </p>
          <ul className="sq-note-list" style={{ marginTop: "var(--s3)" }}>
            {notes.notes.map((note) => (
              <li key={note.id}>
                <NoteRow
                  note={note}
                  topic={showTopicName ? topicName(note.topicId) : null}
                  onOpen={() => setView({ kind: "edit", noteId: note.id })}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function NoteRow({ note, topic, onOpen }: { note: Note; topic: string | null; onOpen: () => void }) {
  return (
    <button type="button" className="sq-note" onClick={onOpen}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="sq-note-title">{note.title || "Untitled"}</span>
        <span className="sq-note-meta">
          {topic ? `${topic} · ` : ""}
          {note.wordCount} word{note.wordCount === 1 ? "" : "s"} · updated{" "}
          {new Date(note.updatedAt).toLocaleDateString()}
          {note.pinned ? " · pinned" : ""}
        </span>
      </span>
    </button>
  );
}

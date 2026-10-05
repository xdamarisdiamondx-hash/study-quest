/**
 * One topic row and the composer that adds new ones (P4).
 *
 * Status is a three-state cycle rather than a dropdown: the common action is "I am working on
 * this", and tapping through it is faster than opening a menu. The select is still there for
 * jumping straight to a state.
 */
import { useState } from "react";
import type { FormEvent } from "react";
import { DragHandle, ReorderButtons } from "@sq/ui";
import { nextTopicStatus } from "@sq/core/subjects";
import { TOPIC_STATUS_LABEL, type Topic, type TopicStatus } from "@sq/core/schemas/subjects";

/** Chips are neutral by default; status gets one of the three reserved tones. */
const TONE: Record<TopicStatus, "neutral" | "iris" | "ok"> = {
  not_started: "neutral",
  learning: "iris",
  mastered: "ok",
};

export function TopicRow({
  topic,
  index,
  total,
  busy,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onMove,
  onStatus,
  onRename,
  onDelete,
}: {
  topic: Topic;
  index: number;
  total: number;
  busy: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  onDragStart?: () => void;
  onDragOver?: () => void;
  onDragLeave?: () => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
  onMove: (from: number, to: number) => void;
  onStatus: (status: TopicStatus) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(topic.name);
  const [confirming, setConfirming] = useState(false);

  const status = topic.status as TopicStatus;

  if (editing) {
    return (
      <li className="sq-topic" data-editing="true">
        <form
          className="sq-row"
          style={{ flex: 1, gap: "var(--s2)" }}
          onSubmit={(e) => {
            e.preventDefault();
            const next = name.trim();
            if (next && next !== topic.name) onRename(next);
            setEditing(false);
          }}
        >
          <input
            className="sq-input"
            value={name}
            maxLength={120}
            autoFocus
            aria-label={`Rename ${topic.name}`}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setName(topic.name);
                setEditing(false);
              }
            }}
          />
          <button type="submit" className="sq-btn sq-btn-primary sq-btn-sm" disabled={busy}>
            Save
          </button>
          <button
            type="button"
            className="sq-btn sq-btn-ghost sq-btn-sm"
            onClick={() => {
              setName(topic.name);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </form>
      </li>
    );
  }

  return (
    <li
      className="sq-topic"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver?.();
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        onDrop?.();
      }}
      onDragEnd={onDragEnd}
      data-dragging={isDragging}
      data-drop={isDropTarget}
    >
      <DragHandle label={topic.name} />
      <span className="sq-topic-text">
        <b>{topic.name}</b>
        {topic.description ? <small>{topic.description}</small> : null}
      </span>

      <button
        type="button"
        className={TONE[status] === "neutral" ? "sq-chip" : `sq-chip sq-chip-${TONE[status]}`}
        disabled={busy}
        onClick={() => onStatus(nextTopicStatus(status))}
        aria-label={`${TOPIC_STATUS_LABEL[status]}. Activate to set ${
          TOPIC_STATUS_LABEL[nextTopicStatus(status)]
        }.`}
        title={`Click to set ${TOPIC_STATUS_LABEL[nextTopicStatus(status)].toLowerCase()}`}
      >
        {TOPIC_STATUS_LABEL[status]}
      </button>

      <ReorderButtons index={index} total={total} label={topic.name} onMove={onMove} />

      {confirming ? (
        <span className="sq-row" style={{ gap: "var(--s2)" }}>
          <span className="sq-sr-only">Confirm deleting {topic.name}</span>
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
      ) : (
        <span className="sq-row" style={{ gap: "var(--s1)" }}>
          <button
            type="button"
            className="sq-btn sq-btn-secondary sq-btn-sm"
            onClick={() => {
              setName(topic.name);
              setEditing(true);
            }}
            aria-label={`Rename ${topic.name}`}
          >
            Rename
          </button>
          <button
            type="button"
            className="sq-btn sq-btn-ghost sq-btn-sm"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${topic.name}`}
          >
            Delete
          </button>
        </span>
      )}
    </li>
  );
}

export function TopicComposer({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (input: { name: string; description?: string }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [open, setOpen] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const ok = await onAdd({
      name: trimmed,
      ...(description.trim() ? { description: description.trim() } : {}),
    });
    if (ok) {
      setName("");
      setDescription("");
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="sq-btn sq-btn-secondary sq-btn-block"
        onClick={() => setOpen(true)}
      >
        Add a topic
      </button>
    );
  }

  return (
    <form className="sq-topic-form" onSubmit={submit}>
      <div className="sq-field">
        <label htmlFor="topic-name">Topic name</label>
        <input
          id="topic-name"
          className="sq-input"
          value={name}
          maxLength={120}
          autoFocus
          placeholder="e.g. Photosynthesis"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="sq-field">
        <label htmlFor="topic-description">Description (optional)</label>
        <input
          id="topic-description"
          className="sq-input"
          value={description}
          maxLength={500}
          placeholder="One line on what this covers"
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="sq-row" style={{ gap: "var(--s2)" }}>
        <button
          type="submit"
          className="sq-btn sq-btn-primary"
          disabled={busy || name.trim().length === 0}
        >
          {busy ? "Adding…" : "Add topic"}
        </button>
        <button type="button" className="sq-btn sq-btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export { TOPIC_STATUS_LABEL };
export type { Topic };

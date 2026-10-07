/**
 * One block of the day (P12): complete, edit minutes, reorder (drag or arrows),
 * remove. Task-kind rows close the loop with the task list — completing here
 * completes the task and pays its XP, because both sides share one service.
 */
import { DragHandle, ReorderButtons } from "@sq/ui";

import type { PlanBlock } from "../../lib/planApi";

interface BlockRowProps {
  block: PlanBlock;
  index: number;
  total: number;
  busy: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onToggle: () => void;
  onMinutes: (minutes: number) => void;
  onMove: (from: number, to: number) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

const KIND_LABEL: Record<string, string> = {
  task: "Task",
  topic: "Topic",
  review: "Review",
  quiz: "Quiz",
  flashcards: "Cards",
  session: "Session",
};

/** Commit on blur/Enter only — typing must not fire a request per keystroke. */
function commitMinutes(raw: string, current: number, onMinutes: (minutes: number) => void): void {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return;
  const next = Math.min(600, Math.max(1, parsed));
  if (next !== current) onMinutes(next);
}

export function BlockRow({
  block,
  index,
  total,
  busy,
  isDragging,
  isDropTarget,
  onToggle,
  onMinutes,
  onMove,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: BlockRowProps) {
  const done = block.status === "done";

  return (
    <li
      className="sq-li"
      draggable
      data-done={done}
      data-dragging={isDragging}
      data-drop={isDropTarget}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
    >
      <DragHandle label={block.title} />
      <button
        type="button"
        className="sq-check"
        data-done={done}
        aria-pressed={done}
        aria-label={done ? `Mark "${block.title}" as not done` : `Complete "${block.title}"`}
        onClick={onToggle}
        disabled={busy}
      />
      <span className="sq-li-text" style={{ minWidth: 0 }}>
        <span
          className="sq-row"
          style={{ gap: "var(--s2)", alignItems: "baseline", flexWrap: "wrap" }}
        >
          <span
            style={{
              color: "var(--strong)",
              fontWeight: done ? 400 : 600,
              textDecoration: done ? "line-through" : "none",
              overflowWrap: "anywhere",
            }}
          >
            {block.title}
          </span>
          <span className="sq-label">{KIND_LABEL[block.kind] ?? block.kind}</span>
          {block.subjectName ? <span className="sq-label">{block.subjectName}</span> : null}
        </span>
      </span>
      <span className="sq-row" style={{ gap: 4 }}>
        {/* Keyed by the stored value: an external change (regenerate) resets the field. */}
        <input
          key={block.plannedMin}
          className="sq-input"
          style={{ width: 54, textAlign: "right" }}
          inputMode="numeric"
          aria-label={`Minutes for ${block.title}`}
          defaultValue={block.plannedMin}
          disabled={busy}
          onBlur={(e) => commitMinutes(e.target.value, block.plannedMin, onMinutes)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <span className="sq-label">min</span>
      </span>
      <ReorderButtons index={index} total={total} label={block.title} onMove={onMove} />
      <button
        type="button"
        className="sq-icon-btn"
        aria-label={`Remove ${block.title} from today`}
        title="Remove from today"
        onClick={onDelete}
        disabled={busy}
      >
        ×
      </button>
    </li>
  );
}

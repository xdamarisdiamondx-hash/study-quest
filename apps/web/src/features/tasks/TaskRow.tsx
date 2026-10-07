/**
 * One row of any task list (P11) — the Tasks page and the subject's Tasks tab share it.
 *
 * Overdue rows stay in the paper palette: a neutral "was due yesterday" line with
 * "Move to today" and "Reschedule" beside it, never a red badge (PRD §15 — no shaming;
 * a missed deadline is information, not a verdict).
 */
import { Button, Chip, IconButton } from "@sq/ui";
import type { Task } from "@sq/core/schemas/tasks";
import { dueLabel, isOverdue, ruleLabel, type TaskStatus } from "@sq/core/tasks";

interface TaskRowProps {
  task: Task;
  now: Date;
  /** Resolved from the subjects list by the caller; null when the task has no subject. */
  subjectName: string | null;
  /** Complete an open task; reopen a done or skipped one. */
  onToggle: () => void;
  /** Opens the edit dialog. Omitted by lists that only read. */
  onEdit?: () => void;
  /** PRD §17: opens the prep suggestion dialog for a topic-linked open task. */
  onPlan?: () => void;
  /** The overdue affordance — sets the deadline to today. */
  onMoveToday?: () => void;
  busy?: boolean;
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function TaskRow({
  task,
  now,
  subjectName,
  onToggle,
  onEdit,
  onPlan,
  onMoveToday,
  busy,
}: TaskRowProps) {
  const done = task.status !== "open";
  const overdue = isOverdue(task.dueAt, task.status as TaskStatus, now);
  const due = dueLabel(task.dueAt, now);

  const checkLabel =
    task.status === "done"
      ? `Mark "${task.title}" as not done`
      : task.status === "skipped"
        ? `Put "${task.title}" back on the list`
        : `Complete "${task.title}"`;

  return (
    <div className="sq-li" data-done={done}>
      <button
        type="button"
        className="sq-check"
        data-done={done}
        aria-pressed={done}
        aria-label={checkLabel}
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
            {task.title}
          </span>
          {task.priority === "high" && !done ? <Chip tone="gold">high</Chip> : null}
          {task.rule ? <Chip tone="neutral">↻ {ruleLabel(task.rule)}</Chip> : null}
          {subjectName ? <span className="sq-label">{subjectName}</span> : null}
          {task.estimateMin > 0 ? <span className="sq-label">{task.estimateMin} min</span> : null}
        </span>
        <span
          className="sq-row"
          style={{ gap: "var(--s2)", marginTop: 2, flexWrap: "wrap", alignItems: "center" }}
        >
          {task.status === "skipped" ? (
            <span className="sq-label">Skipped{task.dueAt ? ` · ${due}` : ""}</span>
          ) : task.status === "done" ? (
            <span className="sq-label">
              {task.completedAt ? `Done ${shortDate(task.completedAt)}` : "Done"}
            </span>
          ) : overdue ? (
            <>
              <span className="sq-label">was due {lower(due)}</span>
              {onMoveToday ? (
                <Button size="sm" variant="ghost" onClick={onMoveToday} disabled={busy}>
                  Move to today
                </Button>
              ) : null}
              {onEdit ? (
                <Button size="sm" variant="ghost" onClick={onEdit} disabled={busy}>
                  Reschedule
                </Button>
              ) : null}
            </>
          ) : (
            <span className="sq-label">{task.dueAt ? due : "No date"}</span>
          )}
        </span>
      </span>
      {onPlan ? (
        <IconButton
          title="What should I do before this?"
          aria-label={`Suggest prep for ${task.title}`}
          onClick={onPlan}
          disabled={busy}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <rect x="3.5" y="5" width="17" height="15" rx="2" />
            <path d="M3.5 9.5h17M8 3v4M16 3v4" />
          </svg>
        </IconButton>
      ) : null}
      {onEdit ? (
        <IconButton title="Edit task" aria-label={`Edit ${task.title}`} onClick={onEdit}>
          ✎
        </IconButton>
      ) : null}
    </div>
  );
}

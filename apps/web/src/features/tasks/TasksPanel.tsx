/**
 * Tasks tab (P11): this subject's open work, in the row format the Tasks page uses.
 *
 * No page furniture of its own — SubjectDetailPage owns the header and tabs, exactly as
 * the Notes, Quizzes and Flashcards panels beside it. Completion works here too (same
 * XP/streak writer); editing lives in the task manager, which the link at the bottom
 * opens with this subject's filter already on.
 */
import { Link } from "react-router-dom";
import { Card, EmptyState } from "@sq/ui";

import { sortTasks } from "@sq/core/tasks";

import { useTaskActions, useTaskList } from "../../lib/useTasks";
import { TaskRow } from "./TaskRow";

interface TasksPanelProps {
  subjectId: string;
}

export function TasksPanel({ subjectId }: TasksPanelProps) {
  const list = useTaskList(subjectId);
  const actions = useTaskActions();

  const tasks = list.data ?? [];
  const open = sortTasks(
    tasks.filter((t) => t.status === "open"),
    "deadline",
  );
  const doneCount = tasks.length - open.length;
  const now = new Date();

  async function toggle(task: (typeof tasks)[number]) {
    try {
      if (task.status === "open") {
        await actions.complete.mutateAsync(task.id);
      } else {
        await actions.uncomplete.mutateAsync(task.id);
      }
    } catch {
      /* the error line in the panel tells the user; state stays put */
    }
  }

  if (list.isPending) {
    return (
      <Card>
        <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>Loading…</p>
      </Card>
    );
  }

  return (
    <Card
      title="Tasks"
      action={
        <span className="sq-label">
          {open.length} open{doneCount > 0 ? ` · ${doneCount} finished` : ""}
        </span>
      }
    >
      {list.isError ? (
        <p className="sq-error" role="alert" style={{ marginTop: 0 }}>
          Could not load this subject's tasks.
        </p>
      ) : null}

      {open.length === 0 && doneCount === 0 ? (
        <EmptyState
          title="No tasks for this subject"
          hint="Tasks you file under this subject collect here; the task manager holds the composer, views and repeat rules."
          action={
            <Link to={`/tasks?subject=${subjectId}`} className="sq-btn sq-btn-secondary">
              Open the task manager
            </Link>
          }
        />
      ) : (
        <>
          {open.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              now={now}
              subjectName={null}
              busy={actions.complete.isPending || actions.uncomplete.isPending}
              onToggle={() => void toggle(task)}
            />
          ))}
          <div className="sq-row" style={{ justifyContent: "flex-end", paddingTop: "var(--s3)" }}>
            <Link to={`/tasks?subject=${subjectId}`} className="sq-btn sq-btn-ghost sq-btn-sm">
              Open the task manager
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}

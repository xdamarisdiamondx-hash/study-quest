/**
 * Tasks (P11): the real task manager — views, filters, sort, completion with undo,
 * neutral overdue handling and the recurring-series controls behind the edit dialog.
 *
 * The list is one query over every task in the account; views (Today / Upcoming / All /
 * Done) and filters are computed here, which keeps switching between them instant. The
 * server materialises recurring occurrences before it answers that query, so rows appear
 * on the right days with no scheduler process (ADR-017).
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Card, EmptyState, Picker } from "@sq/ui";
import type { Task } from "@sq/core/schemas/tasks";
import {
  sortTasks,
  startOfDay,
  TASK_KINDS,
  TASK_PRIORITIES,
  taskView,
  type SortBy,
  type TaskView,
} from "@sq/core/tasks";

import { useSubjects } from "../../lib/useSubjects";
import { useTaskActions, useTaskList } from "../../lib/useTasks";
import { TaskComposer } from "./TaskComposer";
import { TaskRow } from "./TaskRow";

const VIEWS: { id: TaskView; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "all", label: "All" },
  { id: "done", label: "Done" },
];

const EMPTY_COPY: Record<TaskView, { title: string; hint: string }> = {
  today: {
    title: "Nothing due today",
    hint: "Open work with a future date waits in Upcoming; everything else is done. Today only shows what actually needs you.",
  },
  upcoming: {
    title: "Nothing ahead",
    hint: "Tasks with a deadline after today collect here.",
  },
  all: {
    title: "No open tasks",
    hint: "Homework, revision, projects, anything you owe someone — add the first one.",
  },
  done: {
    title: "Nothing finished yet",
    hint: "Completed and skipped tasks land here, newest first.",
  },
};

const kindLabel = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);
const priorityLabel = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

export function TasksPage() {
  // The subject tab deep-links in with ?subject=<id>; the URL seeds the filter once and
  // the picker owns it from there — no effect re-adopts it after the user clears it.
  const [params] = useSearchParams();
  const [view, setView] = useState<TaskView>("today");
  const [sortBy, setSortBy] = useState<SortBy>("deadline");
  const [subjectFilter, setSubjectFilter] = useState<string | null>(params.get("subject"));
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  /** Which dialog is open: null = closed, a Task = edit, undefined-ish "new" = create. */
  const [composer, setComposer] = useState<{ task: Task | null } | null>(null);
  const [undo, setUndo] = useState<{ id: string; title: string; xp: number } | null>(null);

  const list = useTaskList();
  const actions = useTaskActions();
  const subjects = useSubjects();

  const tasks = list.data ?? [];
  const now = new Date();

  const visible = (() => {
    const rows = tasks.filter(
      (t) =>
        // The All view is "everything still open" — taskView's own "all" bucket means
        // something narrower (an open task with no date), so it cannot decide this view.
        (view === "all" ? t.status === "open" : taskView(t.dueAt, t.status, now) === view) &&
        (!subjectFilter || t.subjectId === subjectFilter) &&
        (!kindFilter || t.kind === kindFilter) &&
        (!priorityFilter || t.priority === priorityFilter),
    );
    if (view === "done") {
      return [...rows].sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    }
    return sortTasks(rows, sortBy);
  })();

  const openCount = tasks.filter((t) => t.status === "open").length;

  const subjectName = (id: string | null): string | null =>
    id ? (subjects.subjects.find((s) => s.id === id)?.name ?? null) : null;

  async function toggle(task: Task) {
    try {
      if (task.status === "open") {
        const result = await actions.complete.mutateAsync(task.id);
        setUndo({ id: task.id, title: task.title, xp: result.xpAwarded });
      } else {
        await actions.uncomplete.mutateAsync(task.id);
        setUndo(null);
      }
    } catch {
      /* the row keeps its state; the error line below tells the user */
    }
  }

  async function moveToday(task: Task) {
    try {
      await actions.update.mutateAsync({
        id: task.id,
        input: { dueAt: startOfDay(new Date()).toISOString() },
      });
    } catch {
      /* same: state stays put, the error line speaks */
    }
  }

  // The undo strip fades by itself — a completion is a moment, not a modal.
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(timer);
  }, [undo]);

  const listError = list.isError ? "Could not load your tasks." : null;
  const actionError =
    actions.complete.isError || actions.uncomplete.isError ? "That didn't save. Try again." : null;

  return (
    <div className="sq-col" style={{ marginTop: "var(--s6)" }}>
      <div className="sq-row" style={{ alignItems: "flex-start", gap: "var(--s4)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              font: "var(--t-h1)",
              margin: "0 0 var(--s1)",
              color: "var(--strong)",
              letterSpacing: "-.025em",
            }}
          >
            Tasks
          </h1>
          <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
            {openCount} open · assignments, deadlines and revision
          </p>
        </div>
        <Button variant="primary" onClick={() => setComposer({ task: null })}>
          New task
        </Button>
      </div>

      <div className="sq-row" style={{ gap: "var(--s2)", flexWrap: "wrap" }}>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={view === v.id ? "sq-chip sq-chip-accent" : "sq-chip"}
            onClick={() => setView(v.id)}
            aria-pressed={view === v.id}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div
        className="sq-row"
        style={{ gap: "var(--s3)", flexWrap: "wrap", alignItems: "flex-end" }}
      >
        <div style={{ flex: "1 1 150px" }}>
          <Picker
            label="Subject"
            value={subjectFilter}
            options={subjects.subjects.map((s) => ({ value: s.id, label: s.name }))}
            onChange={setSubjectFilter}
            placeholder="All subjects"
          />
        </div>
        <div style={{ flex: "1 1 130px" }}>
          <Picker
            label="Kind"
            value={kindFilter}
            options={TASK_KINDS.map((k) => ({ value: k, label: kindLabel(k) }))}
            onChange={setKindFilter}
            placeholder="Any kind"
          />
        </div>
        <div style={{ flex: "1 1 130px" }}>
          <Picker
            label="Priority"
            value={priorityFilter}
            options={TASK_PRIORITIES.map((p) => ({ value: p, label: priorityLabel(p) }))}
            onChange={setPriorityFilter}
            placeholder="Any priority"
          />
        </div>
        <div style={{ flex: "1 1 130px" }}>
          <Picker
            label="Sort by"
            value={sortBy}
            options={[
              { value: "deadline", label: "Deadline" },
              { value: "priority", label: "Priority" },
              { value: "estimate", label: "Estimate" },
            ]}
            onChange={(v) => setSortBy((v as SortBy) ?? "deadline")}
          />
        </div>
      </div>

      {undo ? (
        <div
          className="sq-callout sq-row"
          role="status"
          style={{ justifyContent: "space-between", gap: "var(--s3)", alignItems: "center" }}
        >
          <span>
            <b>{undo.title}</b> done{undo.xp > 0 ? ` · +${undo.xp} XP` : ""}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void actions.uncomplete.mutateAsync(undo.id);
              setUndo(null);
            }}
          >
            Undo
          </Button>
        </div>
      ) : null}

      {listError || actionError ? (
        <p className="sq-error" role="alert" style={{ margin: 0 }}>
          {listError ?? actionError}
        </p>
      ) : null}

      {list.isPending ? (
        <Card>
          <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>Loading…</p>
        </Card>
      ) : (
        <Card>
          {visible.length === 0 ? (
            <EmptyState
              title={EMPTY_COPY[view].title}
              hint={EMPTY_COPY[view].hint}
              action={
                view !== "done" ? (
                  <Button variant="secondary" onClick={() => setComposer({ task: null })}>
                    New task
                  </Button>
                ) : undefined
              }
            />
          ) : (
            visible.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                now={now}
                subjectName={subjectName(task.subjectId)}
                busy={actions.complete.isPending || actions.uncomplete.isPending}
                onToggle={() => void toggle(task)}
                onEdit={() => setComposer({ task })}
                onMoveToday={() => void moveToday(task)}
              />
            ))
          )}
        </Card>
      )}

      {composer ? (
        <TaskComposer
          key={composer.task?.id ?? "new"}
          open
          task={composer.task}
          onClose={() => setComposer(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Task composer and editor dialog (P11).
 *
 * One form serves create and edit; editing a recurring occurrence adds the series
 * controls — apply-to-all, skip this occurrence, delete this one, delete the series —
 * so a series can be steered without a separate "manage recurrence" screen (PRD §16:
 * skipping must never delete the series).
 *
 * The page mounts this conditionally with a `key`, so state starts from the task every
 * time and no reset effect is needed.
 */
import { useState } from "react";
import { Button, Dialog, Picker } from "@sq/ui";
import type { CreateTask, Task, UpdateTask } from "@sq/core/schemas/tasks";
import {
  parseWeekdays,
  TASK_KINDS,
  TASK_PRIORITIES,
  type TaskKind,
  type TaskPriority,
} from "@sq/core/tasks";

import { useSubjectTopics, useSubjects } from "../../lib/useSubjects";
import { useTaskActions } from "../../lib/useTasks";

const WEEKDAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date for a `<input type="date">` value. */
function toInputDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromInputDate(v: string): Date {
  return new Date(`${v}T00:00:00`);
}

function fromIso(iso: string | null | undefined): string {
  return iso ? toInputDate(new Date(iso)) : "";
}

const kindLabel = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);

export interface TaskComposerProps {
  open: boolean;
  onClose: () => void;
  /** The task being edited, or null to create a new one. */
  task: Task | null;
  /** Pre-selected subject for a new task (the subject tab passes its own). */
  defaultSubjectId?: string | null;
}

export function TaskComposer({ open, onClose, task, defaultSubjectId }: TaskComposerProps) {
  const isEdit = task !== null;
  const hasSeries = Boolean(task?.recurrenceId);

  const [title, setTitle] = useState(task?.title ?? "");
  const [kind, setKind] = useState<string>(task?.kind ?? "assignment");
  const [subjectId, setSubjectId] = useState<string | null>(
    task?.subjectId ?? defaultSubjectId ?? null,
  );
  const [topicId, setTopicId] = useState<string | null>(task?.topicId ?? null);
  const [due, setDue] = useState<string>(fromIso(task?.dueAt) || toInputDate(new Date()));
  const [priority, setPriority] = useState<string>(task?.priority ?? "normal");
  const [estimate, setEstimate] = useState<string>(
    task?.estimateMin ? String(task.estimateMin) : "",
  );
  const [notes, setNotes] = useState<string>(task?.notes ?? "");
  const [freq, setFreq] = useState<string>(task?.rule?.freq ?? "never");
  const [interval, setInterval] = useState<string>(String(task?.rule?.interval ?? 1));
  const [weekdays, setWeekdays] = useState<number[]>(
    // A fresh weekly rule starts on the first date's own weekday — the day picked, not a
    // hardcoded Monday. An existing rule keeps exactly the days it was saved with.
    task?.rule ? parseWeekdays(task.rule.byWeekday) : [new Date(`${due}T00:00:00`).getDay()],
  );
  const [weekdaysTouched, setWeekdaysTouched] = useState(false);
  const [until, setUntil] = useState<string>(fromIso(task?.rule?.untilAt));
  const [applySeries, setApplySeries] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjects = useSubjects();
  const topics = useSubjectTopics(subjectId ?? undefined);
  const actions = useTaskActions();

  const busy =
    actions.create.isPending ||
    actions.update.isPending ||
    actions.remove.isPending ||
    actions.skip.isPending;
  const repeating = freq !== "never";

  function toggleWeekday(d: number) {
    setWeekdaysTouched(true);
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b),
    );
  }

  function buildRecurrence():
    | {
        freq: "daily" | "weekly" | "monthly";
        interval: number;
        byWeekday: string;
        untilAt: string | null;
      }
    | undefined {
    if (!repeating) return undefined;
    return {
      freq: freq as "daily" | "weekly" | "monthly",
      interval: Math.max(1, Math.min(365, Number(interval) || 1)),
      byWeekday: freq === "weekly" ? weekdays.join(",") : "",
      untilAt: until ? fromInputDate(until).toISOString() : null,
    };
  }

  async function submit() {
    setError(null);
    const trimmed = title.trim();
    if (!trimmed) {
      setError("A task needs a title.");
      return;
    }
    if (repeating && !due) {
      setError("A repeating task needs a first date.");
      return;
    }
    if (freq === "weekly" && weekdays.length === 0) {
      setError("Pick at least one weekday.");
      return;
    }

    const recurrence = buildRecurrence();
    const dueAt = due ? fromInputDate(due).toISOString() : null;
    const estimateMin = Math.max(0, Number(estimate) || 0);
    const placement = { subjectId, topicId };
    const core = {
      title: trimmed,
      ...placement,
      kind: kind as TaskKind,
      priority: priority as TaskPriority,
      estimateMin,
      notes: notes.trim() ? notes.trim() : null,
    };

    try {
      if (!isEdit) {
        const input: CreateTask = { ...core, dueAt, ...(recurrence ? { recurrence } : {}) };
        await actions.create.mutateAsync(input);
      } else {
        // Series edits skip the date: the rule owns the days, so the first date stays
        // where it was and only the rule (or the fields) change.
        const input: UpdateTask =
          hasSeries && applySeries
            ? { ...core, ...(recurrence ? { recurrence } : { recurrence: null }) }
            : { ...core, dueAt };
        await actions.update.mutateAsync({ id: task.id, input, series: hasSeries && applySeries });
      }
      onClose();
    } catch {
      setError("Could not save the task. Check the fields and try again.");
    }
  }

  async function skipOne() {
    if (!task) return;
    try {
      await actions.skip.mutateAsync(task.id);
      onClose();
    } catch {
      setError("Could not skip this occurrence.");
    }
  }

  async function deleteOne() {
    if (!task || !confirm(`Delete "${task.title}"?`)) return;
    try {
      await actions.remove.mutateAsync({ id: task.id });
      onClose();
    } catch {
      setError("Could not delete the task.");
    }
  }

  async function deleteSeries() {
    if (!task) return;
    if (!confirm("Delete the whole series and every occurrence of it?")) return;
    try {
      await actions.remove.mutateAsync({ id: task.id, series: true });
      onClose();
    } catch {
      setError("Could not delete the series.");
    }
  }

  const freqOptions = [
    { value: "never", label: "Does not repeat" },
    { value: "daily", label: "Every day" },
    { value: "weekly", label: "Every week" },
    { value: "monthly", label: "Every month" },
  ];
  const unit =
    freq === "daily"
      ? Number(interval) === 1
        ? "day"
        : "days"
      : freq === "monthly"
        ? Number(interval) === 1
          ? "month"
          : "months"
        : Number(interval) === 1
          ? "week"
          : "weeks";

  return (
    <Dialog open={open} onClose={onClose} title={isEdit ? "Edit task" : "New task"}>
      <form
        className="sq-col"
        style={{ gap: "var(--s3)", minWidth: "min(420px, 80vw)" }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="sq-field">
          <label htmlFor="task-title">Title</label>
          <input
            id="task-title"
            className="sq-input"
            value={title}
            maxLength={200}
            placeholder="Complete Physics assignment"
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="sq-row" style={{ gap: "var(--s3)", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 150px" }}>
            <Picker
              label="Kind"
              value={kind}
              options={TASK_KINDS.map((k) => ({ value: k, label: kindLabel(k) }))}
              onChange={(v) => setKind(v ?? "assignment")}
            />
          </div>
          <div style={{ flex: "1 1 150px" }}>
            <Picker
              label="Priority"
              value={priority}
              options={TASK_PRIORITIES.map((p) => ({ value: p, label: kindLabel(p) }))}
              onChange={(v) => setPriority(v ?? "normal")}
            />
          </div>
        </div>

        <div className="sq-row" style={{ gap: "var(--s3)", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 180px" }}>
            <Picker
              label="Subject"
              value={subjectId}
              options={subjects.subjects.map((s) => ({ value: s.id, label: s.name }))}
              onChange={(v) => {
                setSubjectId(v);
                setTopicId(null);
              }}
              placeholder="No subject"
            />
          </div>
          <div style={{ flex: "1 1 180px" }}>
            <Picker
              label="Topic"
              value={topicId}
              options={topics.topics.map((t) => ({ value: t.id, label: t.name }))}
              onChange={setTopicId}
              placeholder="No topic"
              disabled={!subjectId}
              hint={subjectId ? undefined : "Pick a subject first"}
            />
          </div>
        </div>

        <div className="sq-row" style={{ gap: "var(--s3)", flexWrap: "wrap" }}>
          <div className="sq-field" style={{ flex: "1 1 150px" }}>
            <label htmlFor="task-due">{repeating ? "First date" : "Due"}</label>
            <input
              id="task-due"
              className="sq-input"
              type="date"
              value={due}
              disabled={hasSeries && applySeries}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
          <div className="sq-field" style={{ flex: "1 1 120px" }}>
            <label htmlFor="task-estimate">Estimate (min)</label>
            <input
              id="task-estimate"
              className="sq-input"
              type="number"
              min={0}
              max={10080}
              step={5}
              value={estimate}
              placeholder="e.g. 30"
              onChange={(e) => setEstimate(e.target.value)}
            />
          </div>
        </div>

        {/* --- repetition (ADR-017: the small rule, not the RRULE standard) --- */}
        <div
          className="sq-row"
          style={{ gap: "var(--s3)", flexWrap: "wrap", alignItems: "flex-end" }}
        >
          <div style={{ flex: "1 1 170px" }}>
            <Picker
              label="Repeat"
              value={freq}
              options={freqOptions}
              onChange={(v) => {
                const next = v ?? "never";
                if (next === "weekly" && !task?.rule && !weekdaysTouched) {
                  setWeekdays([new Date(`${due}T00:00:00`).getDay()]);
                }
                setFreq(next);
              }}
            />
          </div>
          {repeating ? (
            <div className="sq-field" style={{ flex: "0 0 auto" }}>
              <label htmlFor="task-interval">Every</label>
              <input
                id="task-interval"
                className="sq-input"
                type="number"
                min={1}
                max={365}
                value={interval}
                style={{ width: "72px" }}
                onChange={(e) => setInterval(e.target.value)}
              />
            </div>
          ) : null}
          {repeating ? (
            <span className="sq-label" style={{ paddingBottom: "10px" }}>
              {unit}
            </span>
          ) : null}
          {repeating ? (
            <div className="sq-field" style={{ flex: "1 1 150px" }}>
              <label htmlFor="task-until">Ends (optional)</label>
              <input
                id="task-until"
                className="sq-input"
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            </div>
          ) : null}
        </div>

        {freq === "weekly" ? (
          <div className="sq-row" style={{ gap: "var(--s2)", alignItems: "center" }}>
            <span className="sq-label">On</span>
            {WEEKDAY_SHORT.map((label, d) => (
              <button
                key={label}
                type="button"
                className={weekdays.includes(d) ? "sq-chip sq-chip-accent" : "sq-chip"}
                aria-pressed={weekdays.includes(d)}
                aria-label={
                  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d]
                }
                onClick={() => toggleWeekday(d)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="sq-field">
          <label htmlFor="task-notes">Notes</label>
          <textarea
            id="task-notes"
            className="sq-input"
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {hasSeries && isEdit ? (
          <label className="sq-row" style={{ gap: "var(--s2)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={applySeries}
              onChange={(e) => setApplySeries(e.target.checked)}
            />
            <span style={{ font: "var(--t-body-sm)", color: "var(--muted)" }}>
              Apply these changes to the whole series
            </span>
          </label>
        ) : null}
        {hasSeries && applySeries ? (
          <p className="sq-help" style={{ margin: 0 }}>
            The deadline stays on its own day — the repeat rule decides which days appear.
          </p>
        ) : null}

        {error ? (
          <p className="sq-error" role="alert" style={{ margin: 0 }}>
            {error}
          </p>
        ) : null}

        <div
          className="sq-row"
          style={{ justifyContent: "flex-end", gap: "var(--s2)", flexWrap: "wrap" }}
        >
          {isEdit ? (
            <>
              {task?.status === "open" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={skipOne}
                  disabled={busy}
                  title="This occurrence doesn't happen; the series continues"
                >
                  Skip this occurrence
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={deleteOne} disabled={busy}>
                Delete
              </Button>
              {hasSeries ? (
                <Button variant="ghost" size="sm" onClick={deleteSeries} disabled={busy}>
                  Delete series
                </Button>
              ) : null}
            </>
          ) : null}
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {isEdit ? "Close" : "Cancel"}
          </Button>
          <Button variant="primary" type="submit" disabled={busy || !title.trim()}>
            {isEdit ? "Save" : "Create task"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Typed client for the tasks API (P11).
 */
import type { CreateTask, Task, UpdateTask } from "@sq/core/schemas/tasks";

import { ApiError } from "./subjectsApi";

export type { CreateTask, Task, UpdateTask };

export interface CompleteResult {
  task: Task;
  xpAwarded: number;
  streak: number | null;
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) throw new ApiError(fallback, res.status);
  return res.json() as Promise<T>;
}

export const tasksApi = {
  /** GET /api/tasks?subjectId=... — the server materialises recurring rows first. */
  list: (scope: { subjectId?: string } = {}) => {
    const params = new URLSearchParams();
    if (scope.subjectId) params.set("subjectId", scope.subjectId);
    const query = params.toString();
    return fetch(query ? `/api/tasks?${query}` : "/api/tasks", { credentials: "same-origin" }).then(
      (r) => json<{ tasks: Task[] }>(r, "Failed to load tasks"),
    );
  },

  /** POST /api/tasks — a `recurrence` in the input creates the series' first row. */
  create: (input: CreateTask) =>
    fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(input),
    }).then((r) => json<{ task: Task }>(r, "Could not save the task")),

  /** PATCH /api/tasks/:id — `series: true` edits every row of the series. */
  update: (id: string, input: UpdateTask, opts: { series?: boolean } = {}) =>
    fetch(`/api/tasks/${encodeURIComponent(id)}${opts.series ? "?series=true" : ""}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(input),
    }).then((r) => json<{ task: Task | null }>(r, "Could not update the task")),

  /** DELETE /api/tasks/:id — one occurrence, or the series with `series: true`. */
  remove: (id: string, opts: { series?: boolean } = {}) =>
    fetch(`/api/tasks/${encodeURIComponent(id)}${opts.series ? "?series=true" : ""}`, {
      method: "DELETE",
      credentials: "same-origin",
    }).then((r) => json<{ ok: true }>(r, "Could not delete the task")),

  complete: (id: string) =>
    fetch(`/api/tasks/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      credentials: "same-origin",
    }).then((r) => json<CompleteResult>(r, "Could not complete the task")),

  uncomplete: (id: string) =>
    fetch(`/api/tasks/${encodeURIComponent(id)}/uncomplete`, {
      method: "POST",
      credentials: "same-origin",
    }).then((r) => json<{ task: Task }>(r, "Could not undo the task")),

  skip: (id: string) =>
    fetch(`/api/tasks/${encodeURIComponent(id)}/skip`, {
      method: "POST",
      credentials: "same-origin",
    }).then((r) => json<{ task: Task }>(r, "Could not skip the task")),
};

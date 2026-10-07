/**
 * Typed client for the plan API (P12): the day's plan, its blocks, the suggested
 * tray, and the per-task prep line — one artifact, read and written here.
 */
import type {
  BlockKind,
  DayCandidate,
  PlanLoad,
  PlanMode,
  TaskSuggestion,
} from "@sq/core/planning";

import { ApiError } from "./subjectsApi";

export type { BlockKind, DayCandidate, PlanLoad, PlanMode, TaskSuggestion };

/** Block statuses the client renders — `dismissed` rows never reach the wire. */
export type BlockState = "pending" | "done";

export interface PlanBlock {
  id: string;
  kind: BlockKind;
  refId: string | null;
  title: string;
  subjectId: string | null;
  subjectName: string | null;
  plannedMin: number;
  status: BlockState;
  completedAt: string | null;
  orderIndex: number;
}

export interface PlanInfo {
  id: string;
  date: string;
  mode: PlanMode;
  status: string;
  generatedAt: string | null;
}

export interface PlanDay {
  plan: PlanInfo;
  blocks: PlanBlock[];
  suggestions: DayCandidate[];
  capacityMin: number;
  load: PlanLoad;
}

export interface AddBlockInput {
  kind: BlockKind;
  refId: string;
  plannedMin: number;
}

export interface BlockPatch {
  plannedMin?: number;
  status?: BlockState;
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) throw new ApiError(fallback, res.status);
  return res.json() as Promise<T>;
}

const post = (path: string, body: unknown, fallback: string) =>
  fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  }).then((r) => json<unknown>(r, fallback));

export const planApi = {
  /** GET /api/plan?date= — blocks, tray, capacity and load in one read. */
  day: (date: string) =>
    fetch(`/api/plan?date=${encodeURIComponent(date)}`, { credentials: "same-origin" }).then((r) =>
      json<PlanDay>(r, "Failed to load the plan"),
    ),

  setMode: (date: string, mode: PlanMode) =>
    post("/api/plan", { date, mode }, "Could not change the mode").then(
      (r) => r as { plan: PlanInfo },
    ),

  /** Rebuild the day; done + dismissed rows survive by default. */
  generate: (date: string, mode?: PlanMode, keepDone = true) =>
    post("/api/plan/generate", { date, mode, keepDone }, "Could not generate the plan").then(
      (r) => r as { plan: PlanInfo; generated: number },
    ),

  add: (date: string, blocks: AddBlockInput[]) =>
    post("/api/plan/blocks", { date, blocks }, "Could not add to the day").then(
      (r) => r as { added: number },
    ),

  /** "Not today" for a suggested candidate — stored, so the tray stays quiet. */
  dismiss: (date: string, taskId: string) =>
    post("/api/plan/dismiss", { date, taskId }, "Could not dismiss the suggestion").then(
      (r) => r as { ok: true },
    ),

  updateBlock: (id: string, patch: BlockPatch) =>
    fetch(`/api/plan/blocks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(patch),
    }).then((r) => json<{ block: PlanBlock }>(r, "Could not update the block")),

  removeBlock: (id: string) =>
    fetch(`/api/plan/blocks/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    }).then((r) => json<{ ok: true }>(r, "Could not remove the block")),

  reorder: (date: string, ids: string[]) =>
    post("/api/plan/reorder", { date, ids }, "Could not reorder the day").then(
      (r) => r as { ok: true },
    ),

  setCapacity: (minutes: number) =>
    post("/api/plan/capacity", { minutes }, "Could not save the capacity").then(
      (r) => r as { capacityMin: number },
    ),

  /** PRD §17: the prep line for one task ("review Motion, then a short quiz"). */
  taskSuggestion: (taskId: string) =>
    fetch(`/api/tasks/suggestions-for/${encodeURIComponent(taskId)}`, {
      credentials: "same-origin",
    }).then((r) => json<{ suggestion: TaskSuggestion | null }>(r, "Failed to load the suggestion")),
};

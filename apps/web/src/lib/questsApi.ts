/**
 * Typed client for the quest API (P13): the active/completed lists, the one
 * suggested quest, template creation, step actions, and the client-driven
 * signals ("opened the notes", "a summary arrived") — quiz and card successes
 * never travel this way; the server hooks them off the graded event itself.
 */
import type { QuestKind } from "@sq/core/quests";

import { ApiError } from "./subjectsApi";

export type { QuestKind };

export type QuestStepState = "done" | "current" | "locked";

export interface QuestStep {
  id: string;
  title: string;
  kind: string;
  orderIndex: number;
  status: "pending" | "done";
  state: QuestStepState;
  target: number;
  progress: number;
  refType: string | null;
  refId: string | null;
  /** The subject a "Continue" link lands in — null when the step has no page. */
  subjectId: string | null;
}

export interface Quest {
  id: string;
  title: string;
  kind: QuestKind;
  xpReward: number;
  status: string;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  steps: QuestStep[];
  progress: { done: number; total: number };
  count: { progress: number; target: number } | null;
}

export interface QuestOffer {
  template: "topic" | "subject";
  scopeId: string;
  title: string;
  subtitle: string;
  reason: string;
}

export interface QuestList {
  active: Quest[];
  completed: Quest[];
  offer: QuestOffer | null;
}

/** What a success path reports back: steps and quests it just finished. */
export interface QuestSignalOutcome {
  stepsCompleted: number;
  questsCompleted: { id: string; title: string; xp: number }[];
  xpAwarded: number;
}

export interface StepActionResult {
  quest: Quest;
  questCompleted: boolean;
  xpAwarded: number;
  questXp: number;
}

export interface CreateQuestBody {
  template: QuestKind;
  title?: string;
  topicId?: string;
  subjectId?: string;
  examDate?: string;
  target?: number;
  steps?: { title: string }[];
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

export const questApi = {
  /** GET /api/quests — active, completed, and the one offer if any. */
  list: () =>
    fetch("/api/quests", { credentials: "same-origin" }).then((r) =>
      json<QuestList>(r, "Failed to load quests"),
    ),

  create: (body: CreateQuestBody) =>
    post("/api/quests", body, "Could not start the quest").then((r) => r as { quest: Quest }),

  /** Decline stores a row — the offer rule then never asks about it again. */
  decline: (body: { template: "topic" | "subject"; scopeId: string; title: string }) =>
    post("/api/quests/offers/decline", body, "Could not decline the offer").then(
      (r) => r as { ok: true },
    ),

  completeStep: (stepId: string) =>
    post(
      `/api/quests/steps/${encodeURIComponent(stepId)}/complete`,
      {},
      "Could not update the step",
    ).then((r) => r as StepActionResult),

  resetStep: (stepId: string) =>
    post(
      `/api/quests/steps/${encodeURIComponent(stepId)}/reset`,
      {},
      "Could not update the step",
    ).then((r) => r as { quest: Quest }),

  abandon: (questId: string) =>
    fetch(`/api/quests/${encodeURIComponent(questId)}`, {
      method: "DELETE",
      credentials: "same-origin",
    }).then((r) => json<{ ok: true }>(r, "Could not abandon the quest")),

  /** The client-driven signal half: viewing is something only the screen knows. */
  signal: (body: { type: "notes_opened" | "summary"; topicId: string }) =>
    post("/api/quests/signals", body, "Could not record the step").then(
      (r) => r as { outcome: QuestSignalOutcome },
    ),
};

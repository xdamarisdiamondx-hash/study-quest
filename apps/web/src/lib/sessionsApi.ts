/**
 * Typed client for the session API (P14, PRD §26): the running session a
 * reload restores, the recent log, starting one of the three modes, marking
 * guided stages, and the finish — which answers with the whole summary card
 * (XP, streak, quest outcome, one suggested next action).
 */
import type { SessionMode } from "@sq/core/sessions";

import { ApiError } from "./subjectsApi";
import type { QuestSignalOutcome } from "./questsApi";

export type { SessionMode };

export interface SessionStep {
  id: string;
  orderIndex: number;
  kind: string;
  title: string;
  refType: string | null;
  refId: string | null;
  status: "pending" | "done";
}

export interface SessionView {
  id: string;
  mode: SessionMode | string;
  status: string;
  subjectId: string | null;
  subjectName: string | null;
  topicId: string | null;
  topicName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  plannedMin: number;
  focusMin: number;
  /** Epoch ms — the timer's start, the one truth the screen renders from. */
  startedAt: number;
  endedAt: number | null;
  steps: SessionStep[];
}

export interface SessionList {
  active: SessionView | null;
  recent: SessionView[];
}

/** What finishing answers: everything the summary card shows. */
export interface SessionSummary {
  session: SessionView;
  xp: number;
  streak: { current: number; longest: number; lastActiveDate: string | null; freezeCount: number };
  quest: QuestSignalOutcome;
  next: string | null;
}

export interface StartSessionBody {
  mode: SessionMode;
  subjectId?: string;
  topicId?: string;
  taskId?: string;
  plannedMin?: number;
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

export const sessionApi = {
  /** GET /api/sessions — the active session (a reload's restore) plus the log. */
  list: () =>
    fetch("/api/sessions", { credentials: "same-origin" }).then((r) =>
      json<SessionList>(r, "Failed to load sessions"),
    ),

  start: (body: StartSessionBody) =>
    post("/api/sessions", body, "Could not start the session").then(
      (r) => r as { session: SessionView },
    ),

  /**
   * Finish: the body carries only the pause the server cannot see. A 409 means
   * another tab already ended (or started) it — the list refetch shows the truth.
   */
  end: (sessionId: string, pausedMin: number) =>
    post(
      `/api/sessions/${encodeURIComponent(sessionId)}/end`,
      { pausedMin },
      "Could not finish the session",
    ).then((r) => r as SessionSummary),

  /** Guided stages: the student marks each one as they run it. */
  setStep: (sessionId: string, stepId: string, status: "done" | "pending") =>
    fetch(`/api/sessions/${encodeURIComponent(sessionId)}/steps/${encodeURIComponent(stepId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ status }),
    }).then((r) => json<{ session: SessionView }>(r, "Could not update the step")),
};

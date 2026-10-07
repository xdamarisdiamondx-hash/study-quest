/**
 * Typed client for the progress API (P16): study time, quiz history and the
 * §24 counts in one read. The shape mirrors the server's `ProgressView`
 * exactly — everything is already serialised (day keys and numbers only), so
 * there is nothing to parse and nothing the client recomputes (ADR-016).
 */
import { ApiError } from "./subjectsApi";

export interface DayMinutes {
  day: string;
  minutes: number;
}

export interface SubjectStudy {
  id: string;
  name: string;
  monogram: string;
  minutes: number;
  days: DayMinutes[];
}

export interface TopicQuizStats {
  topicId: string;
  topicName: string;
  attempts: number;
  average: number | null;
  /** Latest minus first attempt in percentage points; null below two attempts. */
  delta: number | null;
}

export interface ProgressView {
  study: {
    todayMinutes: number;
    weekMinutes: number;
    weekGoal: number;
    window: { from: string; to: string };
    days: DayMinutes[];
    bySubject: SubjectStudy[];
  };
  quiz: {
    attempts: number;
    average: number | null;
    weekAverage: number | null;
    trend: { day: string; percent: number }[];
    byTopic: TopicQuizStats[];
    retries: { retried: number; improved: number; avgDelta: number };
  };
  counts: {
    sessions: number;
    tasksCompleted: number;
    tasksOpen: number;
    questsCompleted: number;
    quizzesCompleted: number;
    subjectsStudied: number;
    topicsMastered: number;
  };
}

export async function fetchProgress(): Promise<ProgressView> {
  const res = await fetch("/api/progress", { credentials: "same-origin" });
  if (!res.ok) throw new ApiError("Failed to load your progress", res.status);
  return res.json() as Promise<ProgressView>;
}

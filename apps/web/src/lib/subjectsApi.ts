/**
 * Typed client for the subject/topic API (P4).
 *
 * One place that knows the route shapes, so pages deal in subjects and topics rather than
 * fetch strings. Cookies ride along automatically — the session is httpOnly.
 */
import type {
  CreateSubject,
  CreateTopic,
  Subject,
  Topic,
  TopicStatus,
  UpdateSubject,
  UpdateTopic,
} from "@sq/core/schemas/subjects";

/** A subject plus what only the server-computed list endpoints know. */
export interface SubjectSummary extends Subject {
  topicCount: number;
  /** 0..1, from the shared formula in @sq/core/progress. */
  progress: number;
  /** Convenience mirror of `archivedAt !== null`. */
  archived: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });

  if (!res.ok) {
    // Prefer the server's own message — the Zod schemas carry human wording.
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      issues?: string[];
    } | null;
    const message = body?.issues?.[0] ?? body?.error ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return (await res.json()) as T;
}

const post = <T>(path: string, body?: unknown) =>
  call<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

const patch = <T>(path: string, body: unknown) =>
  call<T>(path, { method: "PATCH", body: JSON.stringify(body) });

const del = <T>(path: string) => call<T>(path, { method: "DELETE" });

/* --- subjects ----------------------------------------------------------- */

export const subjectsApi = {
  list: () => call<{ subjects: SubjectSummary[] }>("/api/subjects"),

  detail: (id: string) =>
    call<{ subject: SubjectSummary; topics: Topic[] }>(`/api/subjects/${encodeURIComponent(id)}`),

  create: (input: CreateSubject) => post<{ subject: Subject }>("/api/subjects", input),

  update: (id: string, input: UpdateSubject) =>
    patch<{ subject: Subject }>(`/api/subjects/${encodeURIComponent(id)}`, input),

  remove: (id: string) => del<{ ok: true }>(`/api/subjects/${encodeURIComponent(id)}`),

  /** `ids` is the full new order. */
  reorder: (ids: string[]) =>
    post<{ subjects: SubjectSummary[] }>("/api/subjects/reorder", { ids }),

  importTemplates: (names: string[]) =>
    post<{ imported: number }>("/api/subjects/import", { subjects: names }),
};

/* --- topics -------------------------------------------------------------- */

export const topicsApi = {
  create: (subjectId: string, input: CreateTopic) =>
    post<{ topic: Topic }>(`/api/subjects/${encodeURIComponent(subjectId)}/topics`, input),

  update: (topicId: string, input: UpdateTopic) =>
    patch<{ topic: Topic }>(`/api/subjects/topics/${encodeURIComponent(topicId)}`, input),

  remove: (topicId: string) =>
    del<{ ok: true }>(`/api/subjects/topics/${encodeURIComponent(topicId)}`),

  reorder: (subjectId: string, ids: string[]) =>
    post<{ ok: true; order: Record<string, number> }>(
      `/api/subjects/${encodeURIComponent(subjectId)}/topics/reorder`,
      { ids },
    ),
};

/* --- starter templates --------------------------------------------------- */

export interface TemplateSummary {
  name: string;
  monogram: string;
  topicCount: number;
}

export function templatesApi() {
  return call<{ subjects: TemplateSummary[] }>("/api/onboarding/templates");
}

/** Narrowing helper used by callers that only care about the topic status. */
export function isTopicStatus(value: string): value is TopicStatus {
  return value === "not_started" || value === "learning" || value === "mastered";
}

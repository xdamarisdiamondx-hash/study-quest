/**
 * Subject and topic state (P4).
 *
 * One hook owns the list so the Study page, the picker and the detail page agree on what
 * exists. Mutations go through the API and then refetch rather than patching local state,
 * because progress and order are both computed server-side.
 *
 * Note on the effect bodies below: fetching on mount is the one case where an effect is
 * correct — there is no event to fetch from — and the state updates happen in the promise
 * callbacks, never synchronously in the effect body.
 */
import { useCallback, useEffect, useState } from "react";
import { move } from "@sq/core/subjects";
import type { Topic, UpdateTopic } from "@sq/core/schemas/subjects";

import { ApiError, subjectsApi, topicsApi, type SubjectSummary } from "./subjectsApi";

export type SubjectsStatus = "loading" | "ready" | "error";

function message(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export interface SubjectsState {
  status: SubjectsStatus;
  subjects: SubjectSummary[];
  error: string | null;
  /** True while a mutation is in flight, so controls can disable themselves. */
  busy: boolean;
  refresh: () => Promise<void>;
  create: (name: string) => Promise<boolean>;
  rename: (id: string, name: string) => Promise<boolean>;
  setArchived: (id: string, archived: boolean) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  reorder: (ids: string[]) => Promise<boolean>;
  moveTo: (from: number, to: number) => Promise<boolean>;
  importTemplates: (names: string[]) => Promise<number>;
}

export function useSubjects(): SubjectsState {
  const [status, setStatus] = useState<SubjectsStatus>("loading");
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { subjects: rows } = await subjectsApi.list();
      setSubjects(rows);
      setStatus("ready");
      setError(null);
    } catch (err) {
      setStatus("error");
      setError(message(err, "Could not load your subjects."));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    subjectsApi
      .list()
      .then(({ subjects: rows }) => {
        if (cancelled) return;
        setSubjects(rows);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setError(message(err, "Could not load your subjects."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Run a mutation, then refetch. Errors surface as a message, not a thrown exception. */
  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        await refresh();
        return true;
      } catch (err) {
        setError(message(err, "Something went wrong. Try again."));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return {
    status,
    subjects,
    error,
    busy,
    refresh,
    create: (name) => run(() => subjectsApi.create({ name })),
    rename: (id, name) => run(() => subjectsApi.update(id, { name })),
    setArchived: (id, archived) => run(() => subjectsApi.update(id, { archived })),
    remove: (id) => run(() => subjectsApi.remove(id)),
    reorder: (ids) => run(() => subjectsApi.reorder(ids)),
    moveTo: async (from, to) => {
      const ids = move(subjects, from, to).map((s) => s.id);
      // Optimistic: the order is unambiguous, so the row can move before the round trip.
      setSubjects((current) => move(current, from, to));
      return run(() => subjectsApi.reorder(ids));
    },
    importTemplates: async (names) => {
      let imported = 0;
      const ok = await run(async () => {
        imported = (await subjectsApi.importTemplates(names)).imported;
      });
      return ok ? imported : 0;
    },
  };
}

/* --- one subject with its topics --------------------------------------- */

export interface SubjectTopicsState {
  status: SubjectsStatus;
  subject: SubjectSummary | null;
  topics: Topic[];
  error: string | null;
  busy: boolean;
  refresh: () => Promise<void>;
  createTopic: (input: { name: string; description?: string }) => Promise<boolean>;
  updateTopic: (id: string, input: UpdateTopic) => Promise<boolean>;
  removeTopic: (id: string) => Promise<boolean>;
  reorderTopics: (ids: string[]) => Promise<boolean>;
  moveTopic: (from: number, to: number) => Promise<boolean>;
}

export function useSubjectTopics(subjectId: string | undefined): SubjectTopicsState {
  const [status, setStatus] = useState<SubjectsStatus>("loading");
  const [subject, setSubject] = useState<SubjectSummary | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!subjectId) return;
    try {
      const data = await subjectsApi.detail(subjectId);
      setSubject(data.subject);
      setTopics(data.topics);
      setStatus("ready");
      setError(null);
    } catch (err) {
      setStatus("error");
      setError(message(err, "Could not load this subject."));
    }
  }, [subjectId]);

  useEffect(() => {
    if (!subjectId) return;
    let cancelled = false;
    subjectsApi
      .detail(subjectId)
      .then((data) => {
        if (cancelled) return;
        setSubject(data.subject);
        setTopics(data.topics);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setError(message(err, "Could not load this subject."));
      });
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        await refresh();
        return true;
      } catch (err) {
        setError(message(err, "Something went wrong. Try again."));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return {
    status,
    subject,
    topics,
    error,
    busy,
    refresh,
    createTopic: (input) => run(() => topicsApi.create(subjectId!, input)),
    updateTopic: (id, input) => run(() => topicsApi.update(id, input)),
    removeTopic: (id) => run(() => topicsApi.remove(id)),
    reorderTopics: (ids) => run(() => topicsApi.reorder(subjectId!, ids)),
    moveTopic: async (from, to) => {
      const next = move(topics, from, to);
      setTopics(next);
      return run(() =>
        topicsApi.reorder(
          subjectId!,
          next.map((t) => t.id),
        ),
      );
    },
  };
}

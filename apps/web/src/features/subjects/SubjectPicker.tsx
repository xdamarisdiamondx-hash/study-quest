/**
 * The shared subject/topic picker (P4).
 *
 * One component so a task, a note and a study session all name the same things the same way.
 * It fetches subjects itself and exposes topics for whichever subject is chosen.
 */
import { useEffect, useMemo, useState } from "react";
import { Picker, type PickerOption } from "@sq/ui";
import type { Topic } from "@sq/core/schemas/subjects";

import { ApiError, subjectsApi, type SubjectSummary } from "../../lib/subjectsApi";

function message(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export interface SubjectPickerProps {
  subjectId: string | null;
  onSubjectChange: (subjectId: string | null) => void;
  /** Omit to hide the topic half of the picker. */
  topicId?: string | null;
  onTopicChange?: (topicId: string | null) => void;
  /** Only show subjects that are not archived. Defaults to true. */
  activeOnly?: boolean;
  disabled?: boolean;
}

export function SubjectPicker({
  subjectId,
  onSubjectChange,
  topicId,
  onTopicChange,
  activeOnly = true,
  disabled,
}: SubjectPickerProps) {
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  /**
   * Topics are stored against the subject they belong to rather than in a bare list. That
   * way clearing the selection is a change of `subjectId`, not a setState inside an effect.
   */
  const [loaded, setLoaded] = useState<{ subjectId: string; topics: Topic[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    subjectsApi
      .list()
      .then(({ subjects: rows }) => {
        if (cancelled) return;
        setSubjects(activeOnly ? rows.filter((s) => !s.archived) : rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(message(err, "Could not load your subjects."));
      });
    return () => {
      cancelled = true;
    };
  }, [activeOnly]);

  // Topics belong to whichever subject is selected, so they reload on every change.
  useEffect(() => {
    if (!subjectId) return;
    let cancelled = false;
    subjectsApi
      .detail(subjectId)
      .then((data) => {
        if (!cancelled) setLoaded({ subjectId, topics: data.topics });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(message(err, "Could not load topics."));
      });
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  const subjectOptions = useMemo<PickerOption[]>(
    () => subjects.map((s) => ({ value: s.id, label: s.name, prefix: s.monogram })),
    [subjects],
  );

  // A response for the previous subject must not show up under the new one.
  const topicOptions = useMemo<PickerOption[]>(
    () =>
      (loaded?.subjectId === subjectId ? loaded.topics : []).map((t) => ({
        value: t.id,
        label: t.name,
      })),
    [loaded, subjectId],
  );

  return (
    <>
      {error ? (
        <p className="sq-error" role="alert">
          {error}
        </p>
      ) : null}

      <Picker
        label="Subject"
        value={subjectId}
        options={subjectOptions}
        disabled={disabled || subjectOptions.length === 0}
        placeholder={subjectOptions.length === 0 ? "No subjects yet" : "Any subject"}
        hint={subjectOptions.length === 0 ? "Add a subject first." : undefined}
        onChange={(value) => {
          // A topic cannot outlive its subject, so clear it with the subject.
          onTopicChange?.(null);
          onSubjectChange(value);
        }}
      />

      {onTopicChange ? (
        <Picker
          label="Topic"
          value={topicId ?? null}
          options={topicOptions}
          disabled={disabled || !subjectId || topicOptions.length === 0}
          placeholder={!subjectId ? "Pick a subject first" : "Any topic"}
          hint={
            subjectId && topicOptions.length === 0 ? "This subject has no topics yet." : undefined
          }
          onChange={onTopicChange}
        />
      ) : null}
    </>
  );
}

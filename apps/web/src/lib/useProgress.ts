/**
 * Progress state (P16): TanStack Query over /api/progress.
 *
 * The view is pure read — day keys, minute sums and percentages computed on
 * the server from the rows that caused them — so there is nothing to mutate
 * here and nothing to invalidate proactively: a fresh read after any study
 * activity *is* the new truth (ADR-016: compute on read, cache only what
 * earns it; one query key, one refetch).
 */
import { useQuery } from "@tanstack/react-query";

import { fetchProgress } from "./progressApi";

export type { ProgressView, SubjectStudy, TopicQuizStats, DayMinutes } from "./progressApi";

export const progressKeys = {
  all: ["progress"] as const,
  view: ["progress", "view"] as const,
};

/** Study time, quiz history, counts — the whole Progress page in one read. */
export function useProgress() {
  return useQuery({
    queryKey: progressKeys.view,
    queryFn: fetchProgress,
  });
}

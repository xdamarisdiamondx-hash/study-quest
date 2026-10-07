/**
 * Tasks state (P11): TanStack Query over /api/tasks, mutations invalidating the list.
 *
 * Completion resolves with XP facts (how much, which streak day) so the page can show
 * its undo strip from the response rather than a second read. As of P15 the same
 * success also relays the amount as a reward toast and invalidates the gamification
 * view — an award lands in three places at once (task list, level strip, calendar)
 * and none of them may lag behind the ledger.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CreateTask, Task, UpdateTask } from "@sq/core/schemas/tasks";

import { useRewardToast } from "./rewards";
import { tasksApi } from "./tasksApi";
import { gamificationKeys } from "./useGamification";

export type { CreateTask, Task, UpdateTask };

export const tasksKeys = {
  all: ["tasks"] as const,
  list: (subjectId?: string) => ["tasks", "list", subjectId ?? null] as const,
};

/** Every task in the account (or one subject's), newest recurring rows materialised. */
export function useTaskList(subjectId?: string) {
  return useQuery({
    queryKey: tasksKeys.list(subjectId),
    queryFn: () => tasksApi.list({ subjectId }),
    select: (data) => data.tasks,
  });
}

export function useTaskActions() {
  const queryClient = useQueryClient();
  const reward = useRewardToast();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: tasksKeys.all });
  const invalidateGamification = () =>
    queryClient.invalidateQueries({ queryKey: gamificationKeys.all });

  const create = useMutation({
    mutationFn: (input: CreateTask) => tasksApi.create(input),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, input, series }: { id: string; input: UpdateTask; series?: boolean }) =>
      tasksApi.update(id, input, { series }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: ({ id, series }: { id: string; series?: boolean }) =>
      tasksApi.remove(id, { series }),
    onSuccess: invalidate,
  });

  const complete = useMutation({
    mutationFn: (id: string) => tasksApi.complete(id),
    onSuccess: (result) => {
      invalidate();
      invalidateGamification();
      reward(result.xpAwarded, "Task complete");
    },
  });

  const uncomplete = useMutation({
    mutationFn: (id: string) => tasksApi.uncomplete(id),
    // Re-opening revokes the award server-side, so the view follows it back down —
    // but the toast stays silent: taking XP away is not a moment to celebrate.
    onSuccess: () => {
      invalidate();
      invalidateGamification();
    },
  });

  const skip = useMutation({
    mutationFn: (id: string) => tasksApi.skip(id),
    onSuccess: invalidate,
  });

  return { create, update, remove, complete, uncomplete, skip };
}

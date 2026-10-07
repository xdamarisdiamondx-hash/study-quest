/**
 * Tasks state (P11): TanStack Query over /api/tasks, mutations invalidating the list.
 *
 * Completion resolves with XP facts (how much, which streak day) so the page can show
 * its undo strip from the response rather than a second read.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CreateTask, Task, UpdateTask } from "@sq/core/schemas/tasks";

import { tasksApi } from "./tasksApi";

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
  const invalidate = () => queryClient.invalidateQueries({ queryKey: tasksKeys.all });

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
    onSuccess: invalidate,
  });

  const uncomplete = useMutation({
    mutationFn: (id: string) => tasksApi.uncomplete(id),
    onSuccess: invalidate,
  });

  const skip = useMutation({
    mutationFn: (id: string) => tasksApi.skip(id),
    onSuccess: invalidate,
  });

  return { create, update, remove, complete, uncomplete, skip };
}

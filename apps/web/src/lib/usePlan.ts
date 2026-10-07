/**
 * Plan state (P12): TanStack Query over /api/plan.
 *
 * Every mutation invalidates both the day and the task list, because task-kind
 * blocks straddle the two stories — completing one marks the task done (and the
 * task row must not lag behind), while task edits can reword the day. The
 * gamification view joins them (P15): ticking a block off counts a streak day
 * server-side, and the calendar must show it.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { PlanMode } from "@sq/core/planning";

import { planApi, type AddBlockInput, type BlockPatch, type PlanDay } from "./planApi";
import { gamificationKeys } from "./useGamification";
import { tasksKeys } from "./useTasks";

export const planKeys = {
  all: ["plan"] as const,
  day: (date: string) => ["plan", "day", date] as const,
  /** Under `tasks` on purpose: editing a task should refresh its suggestion. */
  suggestion: (taskId: string) => ["tasks", "suggestion", taskId] as const,
};

/** Today's plan — blocks, tray, capacity, load. */
export function usePlanDay(date: string) {
  return useQuery({
    queryKey: planKeys.day(date),
    queryFn: () => planApi.day(date),
  });
}

export function usePlanActions() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: planKeys.all });
    queryClient.invalidateQueries({ queryKey: tasksKeys.all });
    queryClient.invalidateQueries({ queryKey: gamificationKeys.all });
  };

  const setMode = useMutation({
    mutationFn: ({ date, mode }: { date: string; mode: PlanMode }) => planApi.setMode(date, mode),
    onSuccess: invalidate,
  });

  const generate = useMutation({
    mutationFn: ({ date, mode, keepDone }: { date: string; mode?: PlanMode; keepDone?: boolean }) =>
      planApi.generate(date, mode, keepDone),
    onSuccess: invalidate,
  });

  const add = useMutation({
    mutationFn: ({ date, blocks }: { date: string; blocks: AddBlockInput[] }) =>
      planApi.add(date, blocks),
    onSuccess: invalidate,
  });

  const dismiss = useMutation({
    mutationFn: ({ date, taskId }: { date: string; taskId: string }) =>
      planApi.dismiss(date, taskId),
    onSuccess: invalidate,
  });

  const patch = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: BlockPatch }) =>
      planApi.updateBlock(id, patch),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => planApi.removeBlock(id),
    onSuccess: invalidate,
  });

  const reorder = useMutation({
    mutationFn: ({ date, ids }: { date: string; ids: string[] }) => planApi.reorder(date, ids),
    onSuccess: invalidate,
  });

  const setCapacity = useMutation({
    mutationFn: (minutes: number) => planApi.setCapacity(minutes),
    onSuccess: invalidate,
  });

  return { setMode, generate, add, dismiss, patch, remove, reorder, setCapacity };
}

/** PRD §17's prep line for one task — fetched only once the dialog opens. */
export function useTaskSuggestion(taskId: string | null) {
  return useQuery({
    queryKey: planKeys.suggestion(taskId ?? "none"),
    queryFn: () => planApi.taskSuggestion(taskId as string),
    enabled: taskId !== null,
  });
}

export type { PlanDay };

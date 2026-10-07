/**
 * Quest state (P13): TanStack Query over /api/quests.
 *
 * Two cross-phase rules the whole web side inherits:
 * - Every quest write invalidates the quest list — a step finished from a quiz
 *   result or a card batch must be visible on the Quests page without a reload,
 *   so quiz and flashcard mutations invalidate `questKeys` too.
 * - Client signals ("notes opened", "summary arrived") are fire-and-forget with
 *   an invalidation behind them: the student never waits on a stepper.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { questApi, type CreateQuestBody, type QuestList } from "./questsApi";
import { gamificationKeys } from "./useGamification";

export const questKeys = {
  all: ["quests"] as const,
  list: ["quests", "list"] as const,
};

export function useQuests() {
  return useQuery({
    queryKey: questKeys.list,
    queryFn: () => questApi.list(),
  });
}

export function useQuestActions() {
  const queryClient = useQueryClient();
  // Steps pay XP and can finish a quest (P15): the level strip, the streak
  // calendar and the achievements all move with them, so they invalidate here
  // and nowhere per-mutation.
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: questKeys.all });
    void queryClient.invalidateQueries({ queryKey: gamificationKeys.all });
  };

  const create = useMutation({
    mutationFn: (body: CreateQuestBody) => questApi.create(body),
    onSuccess: invalidate,
  });

  const decline = useMutation({
    mutationFn: (body: { template: "topic" | "subject"; scopeId: string; title: string }) =>
      questApi.decline(body),
    onSuccess: invalidate,
  });

  const completeStep = useMutation({
    mutationFn: (stepId: string) => questApi.completeStep(stepId),
    onSuccess: invalidate,
  });

  const resetStep = useMutation({
    mutationFn: (stepId: string) => questApi.resetStep(stepId),
    onSuccess: invalidate,
  });

  const abandon = useMutation({
    mutationFn: (questId: string) => questApi.abandon(questId),
    onSuccess: invalidate,
  });

  return { create, decline, completeStep, resetStep, abandon };
}

/**
 * Fire-and-forget signal for client-known activity. Returns the outcome so a
 * caller *may* celebrate, but never throws into the reader's path — the notes
 * opening must not depend on the stepper being reachable.
 */
export function useQuestSignal() {
  const queryClient = useQueryClient();
  return (type: "notes_opened" | "summary", topicId: string) => {
    void questApi
      .signal({ type, topicId })
      .then(() => queryClient.invalidateQueries({ queryKey: questKeys.all }))
      .catch(() => undefined);
  };
}

export type { QuestList };

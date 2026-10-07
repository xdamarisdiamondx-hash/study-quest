/**
 * Quiz queries and mutations (P8).
 *
 * React Query over `quizApi`, with one rule the whole phase rests on: lists and detail
 * invalidate together after anything is stored — a quiz generated from the tab, an
 * attempt submitted from the editor, and the history shown on the subject page all read
 * the same rows, so they must never disagree about what exists. P15 adds the second
 * half of the same rule: a graded attempt pays XP and moves the streak, so the
 * gamification view invalidates with them and its amount is relayed as a toast.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { GenerateQuizBody, QuizListScope, SubmitOutcome } from "./quizApi";
import { quizApi } from "./quizApi";
import { useRewardToast } from "./rewards";
import { questKeys } from "./useQuests";
import { gamificationKeys } from "./useGamification";

export const quizKeys = {
  all: ["quizzes"] as const,
  list: (scope: QuizListScope) => [...quizKeys.all, "list", scope] as const,
  detail: (id: string) => [...quizKeys.all, "detail", id] as const,
};

export function useQuizList(scope: QuizListScope = {}) {
  return useQuery({
    queryKey: quizKeys.list(scope),
    queryFn: () => quizApi.list(scope),
  });
}

export function useQuizDetail(id: string | null) {
  return useQuery({
    queryKey: quizKeys.detail(id ?? ""),
    queryFn: () => quizApi.get(id ?? ""),
    enabled: Boolean(id),
  });
}

/** Generate and store a quiz (POST /api/quizzes). */
export function useGenerateQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: GenerateQuizBody) => quizApi.generate(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: quizKeys.all }),
  });
}

/**
 * Submit an attempt. Answers the outcome can be `{pending}` — short answers awaiting
 * the student's own verdict — and a second call with their self-marks settles it; both
 * calls invalidate the same lists because only the second one stores anything.
 * Quests invalidate too: a graded attempt is PRD §20's "complete quiz" success event.
 */
export function useSubmitAttempt(quizId: string) {
  const queryClient = useQueryClient();
  const reward = useRewardToast();
  return useMutation({
    mutationFn: (body: {
      answers: { questionId: string; answer: string; selfMark?: "correct" | "incorrect" }[];
      durationMs: number;
    }): Promise<SubmitOutcome> => quizApi.submit(quizId, body),
    onSuccess: (outcome) => {
      if (!("pending" in outcome)) {
        queryClient.invalidateQueries({ queryKey: quizKeys.all });
        queryClient.invalidateQueries({ queryKey: questKeys.all });
        queryClient.invalidateQueries({ queryKey: gamificationKeys.all });
        reward(outcome.xp.total, "Quiz attempt");
      }
    },
  });
}

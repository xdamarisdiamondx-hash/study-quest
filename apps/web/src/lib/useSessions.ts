/**
 * Session state (P14): TanStack Query over /api/sessions.
 *
 * Two cross-phase rules the whole web side inherits: finishing a session is real
 * work in several ledgers at once, so `end` invalidates the quest list *and* the
 * gamification view with its own — the weekly counter and the level strip both
 * moved server-side and neither may wait for a reload. The guided stage marks
 * only touch the session itself.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { sessionApi, type StartSessionBody } from "./sessionsApi";
import { ApiError } from "./subjectsApi";
import { questKeys } from "./useQuests";
import { gamificationKeys } from "./useGamification";

export const sessionKeys = {
  all: ["sessions"] as const,
  list: ["sessions", "list"] as const,
};

export function useSessions() {
  return useQuery({
    queryKey: sessionKeys.list,
    queryFn: () => sessionApi.list(),
  });
}

export function useSessionActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: sessionKeys.all });

  const start = useMutation({
    mutationFn: (body: StartSessionBody) => sessionApi.start(body),
    onSuccess: invalidate,
    // A 409 means another tab already holds the session — refetch shows it
    // running instead of leaving the picker claiming nothing is going on.
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) invalidate();
    },
  });

  const end = useMutation({
    mutationFn: ({ sessionId, pausedMin }: { sessionId: string; pausedMin: number }) =>
      sessionApi.end(sessionId, pausedMin),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      void queryClient.invalidateQueries({ queryKey: questKeys.all });
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.all });
    },
  });

  const setStep = useMutation({
    mutationFn: ({
      sessionId,
      stepId,
      status,
    }: {
      sessionId: string;
      stepId: string;
      status: "done" | "pending";
    }) => sessionApi.setStep(sessionId, stepId, status),
    onSuccess: invalidate,
  });

  return { start, end, setStep };
}

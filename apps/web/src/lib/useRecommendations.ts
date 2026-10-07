/**
 * Recommendation state (P17): one query key per surface, and the plan's
 * anti-spam floor lives here — a suggestion list goes stale no faster than
 * every 30 minutes, and no other mutation ever invalidates it. A completed
 * quiz must not reshuffle the card the student is looking at: the ranking
 * changes when they come back, not while they work (§27: helpful rather than
 * overwhelming).
 *
 * Dismissal is optimistic — the row vanishes on click, the server confirms by
 * returning the same list (it filters the same code for today), and a failed
 * post puts it back.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RecommendationCode } from "@sq/core/planning";

import {
  dismissRecommendation,
  fetchRecommendations,
  type RecommendContext,
  type RecommendationsView,
} from "./recommendationsApi";

export type { RecommendContext, RecommendationsView, Suggestion } from "./recommendationsApi";

export const recommendationKeys = {
  all: ["recommendations"] as const,
  context: (context: RecommendContext) => ["recommendations", context] as const,
};

/** The anti-spam refresh floor (P17's "min 30 min between refreshes"). */
const REFRESH_FLOOR_MS = 30 * 60_000;

export function useRecommendations(context: RecommendContext) {
  return useQuery({
    queryKey: recommendationKeys.context(context),
    queryFn: () => fetchRecommendations(context),
    staleTime: REFRESH_FLOOR_MS,
  });
}

export function useDismissSuggestion(context: RecommendContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (code: RecommendationCode) => dismissRecommendation(code),
    onMutate: async (code) => {
      const key = recommendationKeys.context(context);
      const previous = client.getQueryData<RecommendationsView>(key);
      if (previous) {
        client.setQueryData<RecommendationsView>(key, {
          ...previous,
          suggestions: previous.suggestions.filter((s) => s.code !== code),
        });
      }
      return { previous, key };
    },
    onError: (_err, _code, ctx) => {
      if (ctx?.previous) client.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: (_data, _err, _code, ctx) => {
      if (ctx) void client.invalidateQueries({ queryKey: ctx.key });
    },
  });
}

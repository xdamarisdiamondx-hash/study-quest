/**
 * Flashcard queries and mutations (P9).
 *
 * React Query over `flashApi`, with the same rule P8 set for quizzes: lists,
 * detail, due queues and the summary all read the same rows, so they invalidate
 * together — a card rated in the theatre and a count shown on Home must never
 * disagree about what is due.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CardRating } from "@sq/core/schemas/ai";

import type { CreateDeckBody, DeckListScope, DueScope, GenerateDeckBody } from "./flashcardsApi";
import { flashApi } from "./flashcardsApi";

export const flashKeys = {
  all: ["flashcards"] as const,
  decks: (scope: DeckListScope) => [...flashKeys.all, "decks", scope] as const,
  deck: (id: string) => [...flashKeys.all, "deck", id] as const,
  summary: (subjectId?: string) => [...flashKeys.all, "summary", subjectId ?? "all"] as const,
};

export function useDeckList(scope: DeckListScope = {}) {
  return useQuery({
    queryKey: flashKeys.decks(scope),
    queryFn: () => flashApi.listDecks(scope),
  });
}

export function useDeckDetail(id: string | null) {
  return useQuery({
    queryKey: flashKeys.deck(id ?? ""),
    queryFn: () => flashApi.getDeck(id ?? ""),
    enabled: Boolean(id),
  });
}

/**
 * The queue behind a study session — a snapshot, not a live view.
 *
 * Its key sits outside `flashKeys.all` on purpose: the moment a session's own
 * submit invalidates every count in the phase, the cards being studied must not
 * move under the theatre — the summary screen would vanish with them. A
 * start-nonce keeps each press a fresh fetch, so a queue that read empty a
 * minute ago cannot be served from cache when the student asks again, and
 * staleTime Infinity finishes the picture: what arrived when the session began
 * is what it plays while the counts refresh around it.
 */
export function useStudyQueue(request: { scope: DueScope; n?: number } | null) {
  return useQuery({
    queryKey: ["flashcards-study", request?.scope, request?.n] as const,
    queryFn: () => flashApi.due(request?.scope ?? {}),
    enabled: Boolean(request),
    staleTime: Infinity,
    // Dropped the moment no session watches it: a queue answered "empty" and
    // then left must never be served to the next session that asks for it.
    gcTime: 0,
  });
}

export function useCardsSummary(subjectId?: string) {
  return useQuery({
    queryKey: flashKeys.summary(subjectId),
    queryFn: () => flashApi.summary(subjectId),
  });
}

/** Generate cards to edit — stores nothing, so nothing to invalidate. */
export function useGenerateDeck() {
  return useMutation({
    mutationFn: (body: GenerateDeckBody) => flashApi.generate(body),
  });
}

export function useCreateDeck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDeckBody) => flashApi.createDeck(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: flashKeys.all }),
  });
}

export function useDeleteDeck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => flashApi.deleteDeck(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: flashKeys.all }),
  });
}

/** Card-level changes: the deck's cards, its counts, and the summary move together. */
export function useCardMutation() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: flashKeys.all });
  return {
    add: useMutation({
      mutationFn: ({ deckId, front, back }: { deckId: string; front: string; back: string }) =>
        flashApi.addCard(deckId, { front, back }),
      onSuccess: invalidate,
    }),
    patch: useMutation({
      mutationFn: ({ id, front, back }: { id: string; front?: string; back?: string }) =>
        flashApi.patchCard(id, { front, back }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => flashApi.deleteCard(id),
      onSuccess: invalidate,
    }),
    import: useMutation({
      mutationFn: ({ deckId, text }: { deckId: string; text: string }) =>
        flashApi.importCards(deckId, text),
      onSuccess: invalidate,
    }),
  };
}

/**
 * Rate a whole session. Success invalidates everything a rating touches — the
 * queue, the deck's counts, the list, the summary — because one batch moves all
 * of them at once.
 */
export function useSubmitReviews() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      batchId: string;
      reviews: { cardId: string; rating: CardRating; durationMs?: number }[];
    }) => flashApi.reviews(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: flashKeys.all }),
  });
}

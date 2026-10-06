/**
 * Typed client for the flashcards API (P9).
 *
 * Shape follows `quizApi`: its own fetching, messages written for the screen that
 * shows them. The one structural difference from P8 is deliberate — generation
 * returns cards *without* storing them, because the composer exists to let the
 * student edit before saving; scheduling, likewise, is only ever read back as
 * the server computed it.
 */
import type { CardRating } from "@sq/core/schemas/ai";

import { ApiError } from "./subjectsApi";

/** One card as every screen reads it — the stored SM-2 fields included. */
export interface CardView {
  id: string;
  deckId: string;
  topicId: string | null;
  front: string;
  back: string;
  ease: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  /** ISO string; null = never reviewed, which reads as due. */
  dueAt: string | null;
  lastReviewedAt: string | null;
  createdAt: string;
}

export interface DeckSummary {
  id: string;
  title: string;
  topicId: string | null;
  topicName: string | null;
  sourceNoteId: string | null;
  sourceNoteTitle: string | null;
  cardCount: number;
  dueCount: number;
  createdAt: string;
}

export interface DeckView extends DeckSummary {
  cards: CardView[];
}

/** What generation answers: material to edit, not yet a deck. */
export interface GeneratedCards {
  title: string;
  cards: { front: string; back: string }[];
}

export interface DeckListScope {
  subjectId?: string;
  topicId?: string;
}

export interface GenerateDeckBody {
  noteId?: string;
  topicId?: string;
  cardCount?: number;
  /** Bypass the cache — a second press of Generate should not re-serve the same cards. */
  fresh?: boolean;
}

export interface CreateDeckBody {
  title: string;
  topicId?: string | null;
  sourceNoteId?: string | null;
  cards: { front: string; back: string }[];
}

export interface DueQueue {
  cards: CardView[];
  /** All due cards, before the limit — the "N due" badge. */
  totalDue: number;
}

export interface DueScope {
  deckId?: string;
  subjectId?: string;
  limit?: number;
}

/** PRD §12-style mastery over cards: what is due, what is hard, per-topic coverage. */
export interface CardsSummary {
  due: number;
  hard: number;
  coverage: { topicId: string; topicName: string; reviewed: number; total: number }[];
}

export interface StudyOutcome {
  studied: number;
  xpAwarded: number;
}

async function request<T>(
  path: string,
  init?: RequestInit,
  message = "The flashcards request failed",
): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  }).catch(() => {
    throw new ApiError("The server is not answering.", 0);
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      message?: string;
      issues?: string[];
    } | null;
    const detail = body?.message ?? body?.issues?.join(" ") ?? null;
    throw new ApiError(detail ? `${message}: ${detail}` : message, res.status);
  }
  return res.json() as Promise<T>;
}

export const flashApi = {
  /** POST /api/flashcards/generate — cards to edit; nothing is stored yet. */
  generate: (body: GenerateDeckBody) =>
    request<GeneratedCards>(
      "/api/flashcards/generate",
      { method: "POST", body: JSON.stringify(body) },
      "Flashcard generation failed",
    ),

  /** GET /api/flashcards/decks?subjectId=&topicId= — decks with due counts. */
  listDecks: (scope: DeckListScope = {}) => {
    const params = new URLSearchParams();
    if (scope.subjectId) params.set("subjectId", scope.subjectId);
    if (scope.topicId) params.set("topicId", scope.topicId);
    const query = params.toString();
    return request<{ decks: DeckSummary[] }>(
      query ? `/api/flashcards/decks?${query}` : "/api/flashcards/decks",
      undefined,
      "Decks could not be loaded",
    );
  },

  /** GET /api/flashcards/decks/:id — the deck with every card. */
  getDeck: (id: string) =>
    request<{ deck: DeckView }>(
      `/api/flashcards/decks/${encodeURIComponent(id)}`,
      undefined,
      "The deck could not be loaded",
    ),

  /** POST /api/flashcards/decks — save the edited cards as a deck. */
  createDeck: (body: CreateDeckBody) =>
    request<{ deck: DeckView }>(
      "/api/flashcards/decks",
      { method: "POST", body: JSON.stringify(body) },
      "The deck could not be saved",
    ),

  deleteDeck: (id: string) =>
    request<{ ok: true }>(
      `/api/flashcards/decks/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      "The deck could not be deleted",
    ),

  addCard: (deckId: string, body: { front: string; back: string }) =>
    request<{ card: CardView }>(
      `/api/flashcards/decks/${encodeURIComponent(deckId)}/cards`,
      { method: "POST", body: JSON.stringify(body) },
      "The card could not be added",
    ),

  patchCard: (id: string, body: { front?: string; back?: string }) =>
    request<{ card: CardView }>(
      `/api/flashcards/cards/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(body) },
      "The card could not be saved",
    ),

  deleteCard: (id: string) =>
    request<{ ok: true }>(
      `/api/flashcards/cards/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      "The card could not be deleted",
    ),

  /** POST /api/flashcards/decks/:id/import — pasted TSV (or `::`) lines. */
  importCards: (deckId: string, text: string) =>
    request<{ added: number; skipped: number }>(
      `/api/flashcards/decks/${encodeURIComponent(deckId)}/import`,
      { method: "POST", body: JSON.stringify({ text }) },
      "The paste could not be imported",
    ),

  /** GET /api/flashcards/due?deckId=&subjectId=&limit= — the queue behind "review now". */
  due: (scope: DueScope = {}) => {
    const params = new URLSearchParams();
    if (scope.deckId) params.set("deckId", scope.deckId);
    if (scope.subjectId) params.set("subjectId", scope.subjectId);
    if (scope.limit) params.set("limit", String(scope.limit));
    const query = params.toString();
    return request<DueQueue>(
      query ? `/api/flashcards/due?${query}` : "/api/flashcards/due",
      undefined,
      "Due cards could not be loaded",
    );
  },

  /** GET /api/flashcards/summary?subjectId= — due, hard, and per-topic coverage. */
  summary: (subjectId?: string) => {
    const query = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : "";
    return request<CardsSummary>(
      `/api/flashcards/summary${query}`,
      undefined,
      "Card progress could not be loaded",
    );
  },

  /**
   * POST /api/flashcards/reviews — rate a whole study session in one batch.
   * The batch id makes a re-post idempotent server-side, so a flush after a
   * crash or a retry can never apply a schedule twice.
   */
  reviews: (body: {
    batchId: string;
    reviews: { cardId: string; rating: CardRating; durationMs?: number }[];
  }) =>
    request<StudyOutcome>(
      "/api/flashcards/reviews",
      { method: "POST", body: JSON.stringify(body) },
      "The review could not be saved",
    ),
};

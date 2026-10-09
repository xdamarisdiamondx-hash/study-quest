/**
 * Flashcards tab (P9): the deck side of the subject — what is due, what is
 * hard, how far each topic's cards have got, and every deck itself.
 *
 * It draws no page furniture of its own — SubjectDetailPage owns the header and
 * tab bar, exactly as the Quizzes panel beside it. What it owns is the whole
 * phase: the mastery strip (due, hard, per-topic coverage, and the "review 20
 * now" queue behind it), the composer at the top (source: a topic), the deck
 * list with its due counts, the manager a deck opens into, and the study
 * session itself — one queue, fetched on demand, played on the shared theatre.
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Card, Chip, EmptyState, Picker } from "@sq/ui";
import type { Topic } from "@sq/core/schemas/subjects";

import type { DueScope } from "../../lib/flashcardsApi";
import { formatMonthDay } from "../../lib/i18n";
import { useScrollToFocus } from "../../lib/useFocus";
import {
  useCardsSummary,
  useDeckList,
  useStudyQueue,
  useSubmitReviews,
} from "../../lib/useFlashcards";
import { CardStudy } from "./CardStudy";
import { DeckManage } from "./DeckManage";
import { FlashcardComposer } from "./FlashcardComposer";

interface FlashcardsPanelProps {
  subjectId: string;
  /** Passed in rather than fetched — the page around the panel already holds them. */
  topics: Topic[];
}

const shortDate = (iso: string) =>
  formatMonthDay(iso);

export function FlashcardsPanel({ subjectId, topics }: FlashcardsPanelProps) {
  // A card result from search (P19) deep-links `?focus=<cardId>&deck=<deckId>`:
  // the deck opens straight away and DeckManage outlines the card inside it; a
  // deck result is plain `?focus=<deckId>` and outlines the list row below.
  const [params, setParams] = useSearchParams();
  const focusId = params.get("focus");
  const deckParam = params.get("deck");

  const list = useDeckList({ subjectId });
  const summary = useCardsSummary(subjectId);
  const [topicPick, setTopicPick] = useState<string | null>(null);
  const [openDeck, setOpenDeck] = useState<string | null>(deckParam);
  const [request, setRequest] = useState<{ scope: DueScope; title: string; n: number } | null>(
    null,
  );

  // Centre the outlined deck row once the list has loaded. When the deck is
  // open, the card is centred inside DeckManage instead.
  useScrollToFocus(focusId, !list.isLoading && openDeck === null);

  // A snapshot of the queue, fetched only when a session is asked for — a tab
  // that is only being read should not be pulling cards (useStudyQueue).
  const queue = useStudyQueue(request);
  const submit = useSubmitReviews();

  /** Every press starts a fresh fetch, so an "empty" answer is never cached over a new one. */
  const startStudy = (scope: DueScope, title: string) =>
    setRequest((prev) => ({ scope, title, n: (prev?.n ?? 0) + 1 }));

  const cards = queue.data?.cards ?? null;
  const nothingDue = Boolean(request) && cards !== null && cards.length === 0 && !queue.isFetching;

  // Shared by both views below: the session must open over the manager as well
  // as the list — a deck's own "Study" button lives in the manager.
  const theatre =
    request && cards && cards.length > 0 ? (
      <CardStudy
        key={request.n}
        title={request.title}
        cards={cards}
        submit={(body) => submit.mutateAsync(body)}
        onExit={() => setRequest(null)}
      />
    ) : null;

  const queueNotes = request ? (
    <>
      {queue.error ? (
        <div className="sq-error" role="alert">
          {queue.error.message}
        </div>
      ) : null}
      {queue.isLoading && !cards ? <p className="sq-help">Loading cards…</p> : null}
      {nothingDue ? (
        <p className="sq-help">
          Nothing is due right now — the cards you have studied are waiting out their intervals.
        </p>
      ) : null}
    </>
  ) : null;

  // Self-healing: a picked topic that was deleted falls back to the first one.
  const activeTopic = topics.find((t) => t.id === topicPick) ?? topics[0] ?? null;
  const decks = list.data?.decks ?? [];
  const coverage = summary.data?.coverage ?? [];
  const due = summary.data?.due ?? 0;
  const hard = summary.data?.hard ?? 0;

  if (openDeck) {
    return (
      <>
        {theatre}
        <Card title="Flashcards">
          <DeckManage
            deckId={openDeck}
            onBack={() => {
              // Leaving the manager must not leave a stale landing link behind —
              // a refresh would otherwise reopen the deck the user just left.
              const next = new URLSearchParams(params);
              next.delete("deck");
              next.delete("focus");
              setParams(next, { replace: true });
              setOpenDeck(null);
            }}
            onStudy={(id) =>
              startStudy(
                { deckId: id, limit: 200 },
                decks.find((d) => d.id === id)?.title ?? "Deck",
              )
            }
          />
          {queueNotes}
        </Card>
      </>
    );
  }

  return (
    <>
      {theatre}

      <Card title="Flashcards">
        {topics.length === 0 ? (
          <EmptyState
            title="No topics yet"
            hint="A deck is filed under a topic, so the topic comes first."
          />
        ) : (
          <>
            {(due > 0 || hard > 0 || coverage.length > 0) && (
              <section className="sq-cards-summary" aria-label="Card progress">
                <div className="sq-cards-stats">
                  <div className="sq-cards-stat">
                    <b>{due}</b>
                    <span>due</span>
                  </div>
                  <div className="sq-cards-stat">
                    <b>{hard}</b>
                    <span>hard</span>
                  </div>
                  {due === 0 && <p className="sq-help">All caught up — nothing is due today.</p>}
                  {due > 0 && (
                    <Button
                      size="sm"
                      onClick={() => startStudy({ subjectId, limit: 20 }, "Due cards")}
                    >
                      Review {Math.min(due, 20)} now
                    </Button>
                  )}
                </div>

                {coverage.length > 0 && (
                  <div className="sq-coverage-list">
                    <span className="sq-ai-kicker">Coverage by topic</span>
                    {coverage.map((c) => {
                      const pct = c.total > 0 ? Math.round((c.reviewed / c.total) * 100) : 0;
                      return (
                        <div key={c.topicId} className="sq-coverage">
                          <span className="sq-coverage-name">{c.topicName}</span>
                          <span
                            className="sq-coverage-track"
                            role="img"
                            aria-label={`${c.topicName}: ${c.reviewed} of ${c.total} cards reviewed`}
                          >
                            <span style={{ width: `${pct}%` }} />
                          </span>
                          <span className="sq-coverage-count">
                            {c.reviewed}/{c.total}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            <div style={{ maxWidth: 320 }}>
              <Picker
                label="From topic"
                value={activeTopic?.id ?? ""}
                options={topics.map((t) => ({ value: t.id, label: t.name }))}
                onChange={setTopicPick}
                hint="Cards come from every note filed under this topic."
              />
            </div>

            {activeTopic && (
              <FlashcardComposer
                source={{ kind: "topic", topicId: activeTopic.id }}
                topicId={activeTopic.id}
                sourceName={activeTopic.name}
                onSaved={(deck) => setOpenDeck(deck.id)}
              />
            )}

            {queueNotes}
            {list.error ? (
              // A div, not a p: `.sq-card > p` outranks `.sq-error` and would grey the message out.
              <div className="sq-error" role="alert">
                {list.error.message}
              </div>
            ) : null}
            {summary.error ? (
              <div className="sq-error" role="alert">
                {summary.error.message}
              </div>
            ) : null}

            {list.isLoading ? (
              <p className="sq-help">Loading decks…</p>
            ) : decks.length === 0 ? (
              <EmptyState
                monogram="?"
                title="No decks yet"
                hint="Generate the first one above — it will appear here with its due counts."
              />
            ) : (
              <ul className="sq-deck-list">
                {decks.map((deck) => (
                  <li
                    key={deck.id}
                    className="sq-deck-row"
                    data-focus={focusId === deck.id || undefined}
                  >
                    <div className="sq-deck-row-main">
                      <b>{deck.title}</b>
                      <div className="sq-deck-row-meta">
                        <Chip tone="neutral">{deck.cardCount} cards</Chip>
                        {deck.dueCount > 0 ? (
                          <Chip tone="warn">{deck.dueCount} due</Chip>
                        ) : (
                          <Chip tone="ok">clear</Chip>
                        )}
                        {deck.topicName && <Chip tone="neutral">{deck.topicName}</Chip>}
                        <span className="sq-quiz-row-when">{shortDate(deck.createdAt)}</span>
                      </div>
                    </div>
                    <div className="sq-deck-row-side">
                      <Button size="sm" variant="secondary" onClick={() => setOpenDeck(deck.id)}>
                        Open
                      </Button>
                      {deck.dueCount > 0 && (
                        <Button
                          size="sm"
                          onClick={() => startStudy({ deckId: deck.id, limit: 200 }, deck.title)}
                        >
                          Study
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
    </>
  );
}

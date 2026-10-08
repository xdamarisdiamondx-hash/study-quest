/**
 * Deck manager (P9): the list side of a deck — every card, its badges, and the
 * manual CRUD the phase promises (PRD §14 plus the plan's import/export box).
 *
 * Cards are read by their stored state: a never-reviewed card is "New", a due
 * one says so, and a card with a lapse behind it carries "Hard" — the same
 * `isHard` the summary counts, so a badge here and a number on the tab can
 * never disagree about what a difficult card is.
 *
 * Export runs the shared `toTsv`, import the shared `parseImport`: the file this
 * app writes is exactly the file it accepts, separators flattened on the way
 * out so the round trip is lossless.
 */
import { useState } from "react";
import { Button, Chip, IconButton } from "@sq/ui";
import { isDue, isHard, toTsv } from "@sq/core/flashcards";

import type { CardView } from "../../lib/flashcardsApi";
import { useFocusId, useScrollToFocus } from "../../lib/useFocus";
import { useCardMutation, useDeckDetail, useDeleteDeck } from "../../lib/useFlashcards";

const DAY_MS = 86_400_000;

/** How a card's timing reads on screen: New, Due, in Nd — plus Hard, if missed. */
function CardBadges({ card, now }: { card: CardView; now: Date }) {
  let timing: string;
  if (card.dueAt === null) timing = "New";
  else if (isDue(card, now)) timing = "Due";
  else {
    const days = Math.ceil((Date.parse(card.dueAt) - now.getTime()) / DAY_MS);
    timing = `in ${days}d`;
  }
  const due = timing === "Due";
  return (
    <span className="sq-deck-card-badges">
      <Chip tone={due ? "warn" : "neutral"}>{timing}</Chip>
      {isHard(card) && <Chip tone="bad">Hard</Chip>}
    </span>
  );
}

export interface DeckManageProps {
  deckId: string;
  onBack: () => void;
  /** Start a deck-scoped session — the panel owns the queue and the theatre. */
  onStudy: (deckId: string) => void;
}

export function DeckManage({ deckId, onBack, onStudy }: DeckManageProps) {
  const detail = useDeckDetail(deckId);
  const cards = useCardMutation();
  const removeDeck = useDeleteDeck();

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ front: "", back: "" });
  const [adding, setAdding] = useState<{ front: string; back: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [note, setNote] = useState<string | null>(null);

  // The ?focus= target of a search result (P19): outline the card and centre
  // it once the deck's cards have actually loaded.
  const focusId = useFocusId();
  useScrollToFocus(focusId, !detail.isLoading);

  const deck = detail.data?.deck ?? null;

  if (detail.isLoading) return <p className="sq-help">Loading deck…</p>;
  if (detail.error)
    return (
      <div className="sq-error" role="alert">
        {detail.error.message}
      </div>
    );
  if (!deck) return null;

  const now = new Date();
  const dueCount = deck.cards.filter((c) => isDue(c, now)).length;

  const startEdit = (card: CardView) => {
    setEditing(card.id);
    setDraft({ front: card.front, back: card.back });
    setNote(null);
  };

  const saveEdit = async (id: string) => {
    if (!draft.front.trim() || !draft.back.trim()) return;
    await cards.patch
      .mutateAsync({ id, front: draft.front.trim(), back: draft.back.trim() })
      .catch(() => {});
    setEditing(null);
  };

  const addCard = async () => {
    if (!adding || !adding.front.trim() || !adding.back.trim()) return;
    await cards.add
      .mutateAsync({ deckId: deck.id, front: adding.front.trim(), back: adding.back.trim() })
      .catch(() => {});
    setAdding(null);
  };

  const runImport = async () => {
    const result = await cards.import.mutateAsync({ deckId: deck.id, text: importText });
    setImportText("");
    setImporting(false);
    setNote(
      result.added === 0
        ? `Nothing usable in that paste — ${result.skipped} line${result.skipped === 1 ? "" : "s"} had no pair.`
        : `Added ${result.added} card${result.added === 1 ? "" : "s"}${
            result.skipped > 0
              ? ` (${result.skipped} line${result.skipped === 1 ? "" : "s"} skipped)`
              : ""
          }.`,
    );
  };

  const exportTsv = () => {
    const blob = new Blob([toTsv(deck.cards)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${deck.title.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "deck"}.tsv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteDeck = () => {
    if (!confirm(`Delete “${deck.title}”? Every card in it goes too.`)) return;
    removeDeck
      .mutateAsync(deck.id)
      .then(() => onBack())
      .catch(() => setNote("The deck could not be deleted."));
  };

  const busy = cards.add.isPending || cards.patch.isPending || cards.remove.isPending;

  return (
    <section className="sq-deck-manage" aria-label={`Deck: ${deck.title}`}>
      <header className="sq-deck-manage-head">
        <Button size="sm" variant="secondary" onClick={onBack}>
          ← Decks
        </Button>
        <div className="sq-deck-manage-title">
          <h4>{deck.title}</h4>
          <div className="sq-deck-manage-meta">
            <Chip tone="neutral">{deck.cards.length} cards</Chip>
            {dueCount > 0 && <Chip tone="warn">{dueCount} due</Chip>}
            {deck.topicName && <Chip tone="neutral">{deck.topicName}</Chip>}
            {deck.sourceNoteTitle && <Chip tone="neutral">from {deck.sourceNoteTitle}</Chip>}
          </div>
        </div>
        <div className="sq-deck-manage-actions">
          {dueCount > 0 && (
            <Button size="sm" onClick={() => onStudy(deck.id)}>
              Study {dueCount} due
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={exportTsv}>
            Export
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setImporting((v) => !v);
              setNote(null);
            }}
          >
            Import
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={deleteDeck}
            disabled={removeDeck.isPending}
          >
            {removeDeck.isPending ? "Deleting…" : "Delete deck"}
          </Button>
        </div>
      </header>

      {importing && (
        <div className="sq-deck-import">
          <label className="sq-label" htmlFor="sq-deck-import">
            Paste cards — one per line, separated by a tab or ::
          </label>
          <textarea
            id="sq-deck-import"
            className="sq-input sq-deck-import-text"
            rows={5}
            value={importText}
            placeholder={"What is photosynthesis?\tPlants using light to make food"}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="sq-deck-editor-actions">
            <Button
              size="sm"
              onClick={() => void runImport()}
              disabled={cards.import.isPending || !importText.trim()}
            >
              {cards.import.isPending ? "Importing…" : "Import cards"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setImporting(false)}>
              Cancel
            </Button>
          </div>
          <p className="sq-help">
            Export gives this deck in exactly that format — nothing to remember.
          </p>
        </div>
      )}

      {(note || cards.import.error) && (
        <p className={cards.import.error ? "sq-error" : "sq-help"} role="status">
          {cards.import.error instanceof Error ? cards.import.error.message : note}
        </p>
      )}

      <ul className="sq-deck-cards">
        {deck.cards.map((card, i) => (
          <li key={card.id} className="sq-deck-card" data-focus={focusId === card.id || undefined}>
            {editing === card.id ? (
              <div className="sq-deck-card-edit">
                <input
                  className="sq-input"
                  value={draft.front}
                  aria-label="Front"
                  onChange={(e) => setDraft((d) => ({ ...d, front: e.target.value }))}
                />
                <input
                  className="sq-input"
                  value={draft.back}
                  aria-label="Back"
                  onChange={(e) => setDraft((d) => ({ ...d, back: e.target.value }))}
                />
                <Button
                  size="sm"
                  disabled={
                    busy || !draft.front.trim() || !draft.back.trim() || cards.patch.isPending
                  }
                  onClick={() => void saveEdit(card.id)}
                >
                  {cards.patch.isPending ? "Saving…" : "Save"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <span className="sq-deck-card-index" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="sq-deck-card-sides">
                  <b>{card.front}</b>
                  <span>{card.back}</span>
                </div>
                <CardBadges card={card} now={now} />
                <div className="sq-deck-card-actions">
                  <IconButton
                    aria-label={`Edit card ${i + 1}`}
                    title="Edit"
                    onClick={() => startEdit(card)}
                  >
                    ✎
                  </IconButton>
                  <IconButton
                    aria-label={`Delete card ${i + 1}`}
                    title="Delete"
                    disabled={cards.remove.isPending}
                    onClick={() => {
                      if (confirm("Delete this card?")) void cards.remove.mutate(card.id);
                    }}
                  >
                    ✕
                  </IconButton>
                </div>
              </>
            )}
          </li>
        ))}

        <li className="sq-deck-card sq-deck-card-new">
          {adding ? (
            <div className="sq-deck-card-edit">
              <input
                className="sq-input"
                value={adding.front}
                placeholder="Front — the question"
                aria-label="New card front"
                onChange={(e) => setAdding((a) => (a ? { ...a, front: e.target.value } : a))}
              />
              <input
                className="sq-input"
                value={adding.back}
                placeholder="Back — the answer"
                aria-label="New card back"
                onChange={(e) => setAdding((a) => (a ? { ...a, back: e.target.value } : a))}
              />
              <Button
                size="sm"
                disabled={
                  busy || !adding.front.trim() || !adding.back.trim() || cards.add.isPending
                }
                onClick={() => void addCard()}
              >
                {cards.add.isPending ? "Adding…" : "Add"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setAdding(null)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAdding({ front: "", back: "" })}
            >
              + Add a card
            </Button>
          )}
        </li>
      </ul>
    </section>
  );
}

/**
 * Flashcard composer (P9): generate cards, edit them, then save a deck.
 *
 * The edit step is the phase's contract (PRD §14 turns notes into cards *the
 * student studies*): generation answers with material, never with a stored row,
 * and only what is on screen when Save is pressed becomes a deck. That is the
 * exact inversion of the quiz composer beside it — there, uneditable output is
 * the guarantee that grading is honest; here, editable output is the guarantee
 * that the cards are the student's own.
 *
 * A generation failure leaves the button where it was, like every AI surface:
 * the error below is information, not a lockout.
 */
import { useState } from "react";
import { Button, IconButton, Picker } from "@sq/ui";

import type { DeckView } from "../../lib/flashcardsApi";
import { useCreateDeck, useGenerateDeck } from "../../lib/useFlashcards";
import { AiAvailabilityNotice, useAiAvailability } from "../study/AiAvailability";

/** Where the cards come from — the caller owns the source and files the deck. */
export type CardComposerSource =
  { kind: "note"; noteId: string } | { kind: "topic"; topicId: string };

const COUNTS = [10, 15, 20, 30];

interface EditableCard {
  front: string;
  back: string;
}

export interface FlashcardComposerProps {
  source: CardComposerSource;
  /** Where the saved deck is filed — the note's topic, or the picked topic. */
  topicId: string | null;
  /** Set when the source is a note, so the deck remembers where it came from. */
  sourceNoteId?: string | null;
  /** The note or topic name — the deck's starting title. */
  sourceName: string;
  onSaved: (deck: DeckView) => void;
}

export function FlashcardComposer({
  source,
  topicId,
  sourceNoteId,
  sourceName,
  onSaved,
}: FlashcardComposerProps) {
  const [count, setCount] = useState(15);
  const [cards, setCards] = useState<EditableCard[] | null>(null);
  const [title, setTitle] = useState("");
  const generate = useGenerateDeck();
  const create = useCreateDeck();
  const availability = useAiAvailability();

  const running = generate.isPending;
  const saving = create.isPending;
  const generateError = generate.error instanceof Error ? generate.error.message : null;
  const saveError = create.error instanceof Error ? create.error.message : null;

  const run = () => {
    generate
      .mutateAsync({
        cardCount: count,
        // A press wants new cards, not last press's — bypass the cache (A.8).
        fresh: true,
        ...(source.kind === "note" ? { noteId: source.noteId } : { topicId: source.topicId }),
      })
      .then((r) => {
        setTitle(r.title);
        setCards(r.cards);
      })
      .catch(() => {
        // The message renders below; the button stays live for the next press.
      });
  };

  const update = (i: number, side: "front" | "back", value: string) =>
    setCards((current) =>
      current ? current.map((card, j) => (j === i ? { ...card, [side]: value } : card)) : current,
    );

  const addRow = () => setCards((current) => [...(current ?? []), { front: "", back: "" }]);

  const removeRow = (i: number) =>
    setCards((current) => (current ? current.filter((_, j) => j !== i) : current));

  const discard = () => {
    if (cards && cards.length > 0 && !confirm("Discard these cards?")) return;
    setCards(null);
    setTitle("");
  };

  const save = async () => {
    if (!cards) return;
    const cleaned = cards.map((card) => ({ front: card.front.trim(), back: card.back.trim() }));
    try {
      const { deck } = await create.mutateAsync({
        title: title.trim() || sourceName,
        topicId,
        sourceNoteId: sourceNoteId ?? null,
        cards: cleaned,
      });
      setCards(null);
      setTitle("");
      onSaved(deck);
    } catch {
      // The message renders below; the editor keeps every edit.
    }
  };

  /* --- nothing generated yet: the generate form ------------------------- */

  if (cards === null) {
    return (
      <div className="sq-ai-composer">
        <Picker
          label="Cards"
          value={String(count)}
          options={COUNTS.map((n) => ({ value: String(n), label: `${n}` }))}
          onChange={(v) => setCount(Number(v) || 15)}
          disabled={running}
        />

        <div className="sq-ai-composer-run">
          {/* Not disabled after a failure: a transient provider error should not
              take the button away from the student who wants to try again. */}
          <Button size="sm" onClick={run} disabled={running || availability !== "ready"}>
            {running ? "Generating…" : "Generate cards"}
          </Button>
        </div>

        {running && (
          <div className="sq-quiz-progress" role="status" aria-label="Generating cards">
            <span />
          </div>
        )}

        <p className="sq-ai-composer-preview">
          <strong>{count} cards</strong> — one idea each: a question on the front, a short answer on
          the back. You can edit every card before saving.
        </p>

        <AiAvailabilityNotice availability={availability} />
        {generateError && <p className="sq-error">{generateError}</p>}
      </div>
    );
  }

  /* --- generated: the editing table ------------------------------------- */

  const incomplete = cards.some((card) => !card.front.trim() || !card.back.trim());

  return (
    <div className="sq-deck-editor">
      <div className="sq-deck-title-row">
        <label className="sq-label" htmlFor="sq-deck-title">
          Deck title
        </label>
        <input
          id="sq-deck-title"
          className="sq-input"
          value={title}
          maxLength={120}
          placeholder={sourceName}
          onChange={(e) => setTitle(e.target.value)}
          disabled={saving}
        />
      </div>

      <ul className="sq-deck-edit-list">
        {cards.map((card, i) => (
          <li key={i} className="sq-deck-edit-row">
            <input
              className="sq-input"
              value={card.front}
              placeholder="Front — the question"
              aria-label={`Card ${i + 1} front`}
              disabled={saving}
              onChange={(e) => update(i, "front", e.target.value)}
            />
            <input
              className="sq-input"
              value={card.back}
              placeholder="Back — the answer"
              aria-label={`Card ${i + 1} back`}
              disabled={saving}
              onChange={(e) => update(i, "back", e.target.value)}
            />
            <IconButton
              aria-label={`Remove card ${i + 1}`}
              title="Remove this card"
              disabled={saving}
              onClick={() => removeRow(i)}
            >
              ✕
            </IconButton>
          </li>
        ))}
      </ul>

      <div className="sq-deck-editor-actions">
        <Button size="sm" variant="secondary" disabled={saving} onClick={addRow}>
          Add a card
        </Button>
        <Button size="sm" variant="secondary" disabled={saving} onClick={discard}>
          Start over
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving || incomplete}>
          {saving ? "Saving…" : "Save deck"}
        </Button>
      </div>

      {incomplete && <p className="sq-help">Every card needs a front and a back to be saved.</p>}
      {saveError && <p className="sq-error">{saveError}</p>}
    </div>
  );
}

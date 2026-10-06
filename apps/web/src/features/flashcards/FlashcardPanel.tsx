/**
 * Flashcards panel in the note editor (P9).
 *
 * The note's own deck factory: generate from this note, edit the cards, save —
 * then the deck belongs to the note's topic and shows up in the subject's
 * Flashcards tab, which is also where it gets studied and managed. The panel
 * says so after a save rather than pretending to be a study surface itself.
 *
 * Structure mirrors the summary and quiz panels beside it (head, source row,
 * body, footer meta) so the AI bar opens into one consistent frame.
 */
import { useState } from "react";
import { Button, IconButton } from "@sq/ui";

import type { DeckView } from "../../lib/flashcardsApi";
import { FlashcardComposer } from "./FlashcardComposer";

export interface FlashcardPanelProps {
  noteId: string;
  noteTitle: string;
  sourceWords: number;
  /** The note's topic — where the saved deck is filed. */
  topicId: string | null;
  onClose: () => void;
}

export function FlashcardPanel({
  noteId,
  noteTitle,
  sourceWords,
  topicId,
  onClose,
}: FlashcardPanelProps) {
  const [saved, setSaved] = useState<DeckView | null>(null);
  const sourceName = noteTitle.trim() || "Untitled note";

  return (
    <section className="sq-ai-panel" aria-label="Flashcards">
      <header className="sq-ai-head">
        <h3>Flashcards</h3>
        <div className="sq-ai-head-actions">
          <IconButton onClick={onClose} title="Back to the note" aria-label="Back to the note">
            ✕
          </IconButton>
        </div>
      </header>

      <div className="sq-ai-source">
        <span className="sq-ai-kicker">Grounded in</span>
        <span>
          {sourceName} · {sourceWords} words
        </span>
      </div>

      <div className="sq-ai-body" aria-live="polite">
        {saved ? (
          <div className="sq-deck-saved">
            <p className="sq-ai-empty">
              <strong>{saved.title}</strong> was saved with {saved.cardCount} card
              {saved.cardCount === 1 ? "" : "s"}.
            </p>
            <p className="sq-help">
              Study it and edit its cards from the subject&apos;s Flashcards tab — a deck belongs to
              its topic, not to this panel.
            </p>
            <Button size="sm" variant="secondary" onClick={() => setSaved(null)}>
              Make another deck
            </Button>
          </div>
        ) : (
          <FlashcardComposer
            source={{ kind: "note", noteId }}
            topicId={topicId}
            sourceNoteId={noteId}
            sourceName={sourceName}
            onSaved={setSaved}
          />
        )}
      </div>

      <footer className="sq-ai-foot">
        <span className="sq-ai-foot-meta">
          {saved
            ? `Saved to Flashcards: ${saved.title}`
            : "Nothing is stored until you save — edit every card first."}
        </span>
      </footer>
    </section>
  );
}

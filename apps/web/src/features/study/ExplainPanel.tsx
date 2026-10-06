/**
 * Explain panel (P7).
 *
 * The point of this panel is the loop: ask in one style, read it, ask again in another,
 * and keep every attempt on screen so the styles can be compared instead of one silently
 * replacing the last. The newest attempt sits first; older ones fade back but stay readable.
 *
 * Grounding is structural rather than claimed. When the question came from a selection,
 * those words are rendered verbatim in the "From your notes" block above the panel body —
 * the student's material and the generated explanation are visibly different things,
 * because one is copied out of the note and one is not.
 */
import { useState } from "react";
import { Button, IconButton, Picker } from "@sq/ui";
import { renderMarkdown } from "@sq/core/markdown";
import type { ExplainStyle } from "@sq/core/schemas/ai";

import { useAiStream, useFlash } from "../../lib/useAiStream";
import { useNoteActions } from "../../lib/useNotes";

const STYLES: { value: ExplainStyle; label: string }[] = [
  { value: "simple", label: "Simple" },
  { value: "step_by_step", label: "Step-by-step" },
  { value: "example", label: "Example" },
  { value: "real_life", label: "Real-life" },
  { value: "beginner", label: "Beginner" },
];

/** Keep a saved note's title inside the 200-character limit the schema enforces. */
const MAX_TITLE = 200;

/** Past attempts, so a later style can be read against the one it replaced. */
interface Attempt {
  id: string;
  style: ExplainStyle;
  text: string;
  cached: boolean;
}

export interface ExplainPanelProps {
  noteId: string;
  noteTitle: string;
  /** The note's current selection, if the panel was opened from one. */
  selection: string;
  /** Needed to file a saved explanation — without it the note would be orphaned. */
  topicId: string | null;
  onClose: () => void;
}

export function ExplainPanel({ noteId, noteTitle, selection, topicId, onClose }: ExplainPanelProps) {
  const [question, setQuestion] = useState(selection);
  const [style, setStyle] = useState<ExplainStyle>("simple");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [flash, setFlash] = useFlash();
  const ai = useAiStream();
  const notes = useNoteActions();

  const running = ai.status === "running";
  const styleLabel = STYLES.find((s) => s.value === style)?.label ?? "Simple";
  /** The attempt Save and Copy act on: the newest one that actually finished. */
  const latest = attempts[0];
  const source = selection.trim();

  const ask = async () => {
    const trimmed = question.trim();
    if (!trimmed) return;
    const outcome = await ai.run("/api/ai/explain", { noteId, text: trimmed, style });
    if (!outcome?.text) return; // failed or stopped — nothing worth keeping
    setAttempts((prev) =>
      [{ id: crypto.randomUUID(), style, text: outcome.text, cached: outcome.cached }, ...prev].slice(0, 8),
    );
  };

  const saveAsNote = async () => {
    if (!topicId || !latest) return;
    const prefix = "Explanation — ";
    await notes.createNote.mutateAsync({
      topicId,
      title: `${prefix}${question.trim()}`.slice(0, MAX_TITLE),
      // The passage it came from stays attached, so the note still reads as grounded
      // once it is out of this panel.
      bodyMd: `${source ? `> ${source}\n\n` : ""}${latest.text}`,
    });
    setFlash("Saved to notes");
  };

  const copy = async () => {
    if (!latest) return;
    try {
      await navigator.clipboard.writeText(latest.text);
      setFlash("Copied");
    } catch {
      setFlash("Could not copy");
    }
  };

  return (
    <section className="sq-ai-panel" aria-label="Explain">
      <header className="sq-ai-head">
        <h3>Explain</h3>
        <div className="sq-ai-head-actions">
          {flash && <span className="sq-ai-head-meta">{flash}</span>}
          <IconButton onClick={onClose} title="Back to the note" aria-label="Back to the note">
            ✕
          </IconButton>
        </div>
      </header>

      {source && (
        <>
          <div className="sq-ai-source">
            <span className="sq-ai-kicker">From your notes</span>
            <span>{noteTitle.trim() || "Untitled note"}</span>
          </div>
          <blockquote className="sq-ai-from-notes">{source}</blockquote>
        </>
      )}

      <div className="sq-ai-ask">
        <div className="sq-field">
          <label htmlFor="sq-explain-ask">What don't you understand?</label>
          <input
            id="sq-explain-ask"
            className="sq-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !running) void ask();
            }}
            placeholder="e.g. momentum"
            disabled={running}
          />
        </div>
        <div className="sq-field sq-field-compact">
          <Picker
            label="Style"
            value={style}
            options={STYLES.map((s) => ({ value: s.value, label: s.label }))}
            onChange={(v) => setStyle((v as ExplainStyle) ?? "simple")}
            disabled={running}
          />
        </div>
        <div className="sq-ai-composer-run">
          <Button size="sm" onClick={() => (running ? ai.stop() : void ask())} disabled={!question.trim() && !running}>
            {running ? "Stop" : attempts.length ? "Explain another way" : "Explain"}
          </Button>
        </div>
      </div>

      <div className="sq-ai-body" aria-live="polite">
        {ai.status === "error" && <p className="sq-error">{ai.error}</p>}

        {!attempts.length && ai.partial === null && ai.status !== "error" && (
          <p className="sq-ai-empty">
            Select a line in your note — or just type what is not landing — and ask. Then ask again in a
            different style: every attempt stays here so you can compare them.
          </p>
        )}

        {/* Live text while it streams. It is deliberately *not* an attempt yet: a
            half-finished answer must never end up in the list you save from. */}
        {ai.partial !== null && (
          <div className="sq-ai-attempt">
            <div className="sq-ai-attempt-label">{styleLabel} — writing</div>
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(ai.partial) }} />
          </div>
        )}

        {attempts.map((attempt, index) => (
          <div
            key={attempt.id}
            className={index === 0 && ai.partial === null ? "sq-ai-attempt" : "sq-ai-attempt sq-ai-attempt-older"}
          >
            <div className="sq-ai-attempt-label">
              {STYLES.find((s) => s.value === attempt.style)?.label ?? attempt.style}
              {attempt.cached ? " · from cache" : ""}
            </div>
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(attempt.text) }} />
          </div>
        ))}
      </div>

      <footer className="sq-ai-foot">
        <span className="sq-ai-foot-meta">
          {attempts.length === 0
            ? "No explanations yet"
            : attempts.length === 1
              ? "1 explanation"
              : `${attempts.length} explanations`}
          {topicId ? "" : " · no topic to file a copy under"}
        </span>
        <div className="sq-ai-actions">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void saveAsNote()}
            disabled={!latest || !topicId}
          >
            Save as note
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void copy()} disabled={!latest}>
            Copy
          </Button>
        </div>
      </footer>
    </section>
  );
}

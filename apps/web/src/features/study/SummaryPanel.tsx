/**
 * Summary composer and result panel (P7).
 *
 * Owns the whole cycle — pick length and format, generate, read, then regenerate, save,
 * copy or print — so the note editor only has to decide *when* to show it.
 *
 * It renders into the editor's main area rather than beside it: a summary is read, not
 * referenced, so it takes the space the textarea would have had.
 */
import { useState } from "react";
import { Button, Chip, IconButton, Picker } from "@sq/ui";
import { renderMarkdown, wordCount } from "@sq/core/markdown";
import type { SummaryFormat, SummaryLength } from "@sq/core/schemas/ai";

import { useAiStream, useFlash } from "../../lib/useAiStream";
import { useNoteActions } from "../../lib/useNotes";

/**
 * These labels and descriptions mirror `LENGTH_WORDS` and `FORMAT_RULES` in
 * `apps/server/src/ai/prompts.ts`, so the preview line says what the model was actually
 * asked for. They are display copy, not logic — the server remains the source of truth
 * for what the model does.
 */
const LENGTHS: { value: SummaryLength; label: string; note: string }[] = [
  { value: "quick", label: "Quick", note: "about 60 words" },
  { value: "standard", label: "Standard", note: "about 150 words" },
  { value: "detailed", label: "Detailed", note: "about 400 words" },
];

const FORMATS: { value: SummaryFormat; label: string; note: string }[] = [
  { value: "paragraph", label: "Paragraph", note: "one flowing paragraph" },
  { value: "bullets", label: "Bullet points", note: "one idea per line" },
  { value: "key_points", label: "Key points", note: "each point — its explanation" },
  { value: "exam_style", label: "Exam-style notes", note: "fragments under short headings" },
];

const MAX_TITLE = 200;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

export interface SummaryPanelProps {
  noteId: string;
  noteTitle: string;
  /** Word count of the note being summarised, for the "of N words" comparison. */
  sourceWords: number;
  /** Needed to file a saved copy — without it the note would be orphaned. */
  topicId: string | null;
  onClose: () => void;
}

export function SummaryPanel({ noteId, noteTitle, sourceWords, topicId, onClose }: SummaryPanelProps) {
  const [length, setLength] = useState<SummaryLength>("standard");
  const [format, setFormat] = useState<SummaryFormat>("bullets");
  const [flash, setFlash] = useFlash();
  const ai = useAiStream();
  const notes = useNoteActions();

  const lengthChoice = LENGTHS.find((l) => l.value === length)!;
  const formatChoice = FORMATS.find((f) => f.value === format)!;
  const hasResult = ai.result.length > 0;
  const running = ai.status === "running";
  const sourceName = noteTitle.trim() || "Untitled note";

  const generate = (fresh: boolean) => {
    void ai.run("/api/ai/summarise", { noteId, length, format }, fresh);
  };

  const saveToNote = async () => {
    if (!topicId || !ai.text) return;
    const prefix = "Summary — ";
    await notes.createNote.mutateAsync({
      topicId,
      title: `${prefix}${sourceName}`.slice(0, MAX_TITLE),
      bodyMd: ai.text,
    });
    setFlash("Saved to notes");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ai.text);
      setFlash("Copied");
    } catch {
      setFlash("Could not copy");
    }
  };

  const print = () => {
    const win = window.open("", "_blank");
    if (!win) {
      setFlash("Pop-up blocked");
      return;
    }
    win.document.open();
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(sourceName)}</title>` +
        `<style>body{font:16px/1.7 system-ui,sans-serif;max-width:42rem;margin:3rem auto;padding:0 1.5rem;` +
        `color:#1c1917}h1{font-size:1.4rem;margin:0 0 .25rem}.meta{color:#78716c;font-size:.85rem;` +
        `margin-bottom:2rem}blockquote{border-left:3px solid #d6d3d1;margin:0 0 1rem;padding-left:1rem}` +
        `ul,ol{padding-left:1.25em}</style></head><body>` +
        `<h1>Summary — ${escapeHtml(sourceName)}</h1>` +
        `<div class="meta">${escapeHtml(`${lengthChoice.label} · ${formatChoice.label}`)}</div>` +
        `${renderMarkdown(ai.text)}</body></html>`,
    );
    win.document.close();
    win.print();
  };

  return (
    <section className="sq-ai-panel" aria-label="Summary">
      <header className="sq-ai-head">
        <h3>Summary</h3>
        {ai.cached && <Chip tone="neutral">Cached</Chip>}
        {ai.stopped && <Chip tone="warn">Stopped early</Chip>}
        <div className="sq-ai-head-actions">
          {flash && <span className="sq-ai-head-meta">{flash}</span>}
          <IconButton onClick={onClose} title="Back to the note" aria-label="Back to the note">
            ✕
          </IconButton>
        </div>
      </header>

      <div className="sq-ai-composer">
        <Picker
          label="Length"
          value={length}
          options={LENGTHS.map((l) => ({ value: l.value, label: l.label }))}
          onChange={(v) => setLength((v as SummaryLength) ?? "standard")}
          disabled={running}
        />
        <Picker
          label="Format"
          value={format}
          options={FORMATS.map((f) => ({ value: f.value, label: f.label }))}
          onChange={(v) => setFormat((v as SummaryFormat) ?? "bullets")}
          disabled={running}
        />
        <div className="sq-ai-composer-run">
          <Button size="sm" onClick={() => (running ? ai.stop() : generate(hasResult))} disabled={ai.status === "error" && !hasResult}>
            {running ? "Stop" : hasResult ? "Regenerate" : "Generate"}
          </Button>
        </div>
        <p className="sq-ai-composer-preview">
          <strong>{lengthChoice.label}</strong> · <strong>{formatChoice.label}</strong> — {lengthChoice.note},{" "}
          {formatChoice.note}.
        </p>
      </div>

      <div className="sq-ai-source">
        <span className="sq-ai-kicker">Grounded in</span>
        <span>
          {sourceName} · {sourceWords} words
        </span>
      </div>

      <div className="sq-ai-body" aria-live="polite">
        {!hasResult && !ai.partial && ai.status !== "error" && (
          <p className="sq-ai-empty">
            Choose a length and a format, then generate. The summary is drawn only from these notes.
          </p>
        )}
        {ai.status === "error" && <p className="sq-error">{ai.error}</p>}
        {ai.text && <div dangerouslySetInnerHTML={{ __html: renderMarkdown(ai.text) }} />}
      </div>

      <footer className="sq-ai-foot">
        <span className="sq-ai-foot-meta">
          {hasResult || ai.partial ? `${wordCount(ai.text)} of ${sourceWords} words` : "Nothing generated yet"}
          {topicId ? "" : " · no topic to file a copy under"}
        </span>
        <div className="sq-ai-actions">
          <Button variant="secondary" size="sm" onClick={() => void saveToNote()} disabled={!hasResult || !topicId}>
            Save to note
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void copy()} disabled={!hasResult}>
            Copy
          </Button>
          <Button variant="secondary" size="sm" onClick={print} disabled={!hasResult}>
            Print
          </Button>
        </div>
      </footer>
    </section>
  );
}

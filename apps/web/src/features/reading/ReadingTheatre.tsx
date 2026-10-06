/**
 * Read My Notes theatre (P10) — the note as a reading column with the voice following it.
 *
 * Reuses the quiz frame (progress bar, meta row, foot, pause veil) because a session is a
 * session: the differences are all in the middle. The note is re-segmented by the shared
 * `segmentForReading` so every sentence owns a `<span>` React renders — the highlight is
 * then just that span's class, and clicking any sentence jumps the reading there. Blocks
 * keep their shape around the spans: headings, lists and quotes read exactly as they do in
 * the editor, because a study note read as a wall of prose is a worse note.
 *
 * "Explain this" is the pause-and-ask of PRD §10: it stops the voice, sends the current
 * sentence to `explain.v1` with the note as context, and the answer streams in under the
 * very block the sentence sits in — the student never leaves the sentence they lost on.
 */
import { createElement, Fragment, memo, useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Button, Chip, IconButton, Picker } from "@sq/ui";
import {
  renderInline,
  renderMarkdown,
  segmentForReading,
  type ReadBlock,
  type ReadSentence,
} from "@sq/core/markdown";

import { useAiStream } from "../../lib/useAiStream";
import { useAiAvailability } from "../study/AiAvailability";
import { useReading } from "./useReading";

const RATES = [
  { value: "0.7", label: "0.7× slow" },
  { value: "0.85", label: "0.85×" },
  { value: "1", label: "1× normal" },
  { value: "1.2", label: "1.2×" },
  { value: "1.4", label: "1.4×" },
];

const PITCHES = [
  { value: "0.8", label: "Low" },
  { value: "1", label: "Normal" },
  { value: "1.25", label: "High" },
];

/** One sentence span. Memoised: only the current sentence re-renders on each tick. */
const SentenceSpan = memo(function SentenceSpan({
  index,
  sentence,
  current,
  progress,
  onPick,
}: {
  index: number;
  sentence: ReadSentence;
  current: boolean;
  progress: number;
  onPick: (i: number) => void;
}) {
  return (
    <span
      id={`sq-read-s-${index}`}
      className={current ? "sq-read-sent sq-read-sent-on" : "sq-read-sent"}
      aria-current={current ? "true" : undefined}
      style={current ? ({ "--p": String(progress) } as CSSProperties) : undefined}
      onClick={(e) => {
        // A link inside the sentence is still a link: navigation wins over jump-to-read.
        if ((e.target as HTMLElement).closest("a")) return;
        onPick(index);
      }}
      dangerouslySetInnerHTML={{ __html: renderInline(sentence.source) }}
    />
  );
});

export interface ReadingTheatreProps {
  /** Saved-note id — the explain call needs one. Absent for an unsaved draft. */
  noteId?: string;
  title: string;
  bodyMd: string;
  onClose: () => void;
}

export function ReadingTheatre({ noteId, title, bodyMd, onClose }: ReadingTheatreProps) {
  const [veiled, setVeiled] = useState(false);
  const [explain, setExplain] = useState<{ block: number; sentence: string } | null>(null);

  const ai = useAiStream();
  const availability = useAiAvailability();

  /* Segment once per body: `useReading`'s speak effect keys on this array, so it must not
     change identity while the theatre is open. */
  const { blocks, sentences, blockOf, blockStarts } = useMemo(() => {
    const blocks = segmentForReading(bodyMd);
    const sentences: ReadSentence[] = [];
    const blockOf: number[] = [];
    const blockStarts: number[] = [];
    blocks.forEach((b, k) => {
      blockStarts.push(sentences.length);
      const push = (s: ReadSentence) => {
        sentences.push(s);
        blockOf.push(k);
      };
      if (b.kind === "list") b.items.forEach((item) => item.forEach(push));
      else if (b.kind !== "code") b.sentences.forEach(push);
    });
    return { blocks, sentences, blockOf, blockStarts };
  }, [bodyMd]);

  const reading = useReading(sentences);
  const { index, phase, progress, position, total } = reading;
  const pct = total > 0 ? Math.round((position / total) * 100) : 0;

  /* Stable while `jumpTo` is: SentenceSpan is memoised, so an inline arrow here would
     re-render every span in the note on every tick. */
  const { jumpTo } = reading;
  const pick = useCallback((i: number) => jumpTo(i), [jumpTo]);

  /* --- explain this ----------------------------------------------------- */

  const askExplain = async () => {
    if (!noteId || index < 0 || availability !== "ready" || ai.status === "running") return;
    const sentence = sentences[index]?.text;
    if (!sentence) return;
    reading.pause(); // pause and ask — the answer arrives to a still page
    setExplain({ block: blockOf[index] ?? 0, sentence });
    await ai.run("/api/ai/explain", { noteId, text: sentence, style: "simple" });
  };

  const dismissExplain = () => {
    ai.stop();
    setExplain(null);
  };

  const explainTitle = !noteId
    ? "Save the note first — explanations are grounded in the saved note."
    : availability !== "ready"
      ? "AI is not available right now."
      : index < 0
        ? "Start reading, then ask about the sentence you are on."
        : "Explain the current sentence in simpler language";

  /* --- rendering -------------------------------------------------------- */

  const spanNodes = (list: ReadSentence[], from: number) =>
    list.flatMap((s, j) => {
      const gi = from + j;
      const span = (
        <SentenceSpan
          key={gi}
          index={gi}
          sentence={s}
          current={gi === index}
          progress={gi === index ? progress : 0}
          onPick={pick}
        />
      );
      // Sentence chunks are split *on* the boundary space, so two spans in a row have no
      // text node between them — without this the note reads "…acts on it.Mass…".
      return j === 0 ? [span] : [" ", span];
    });

  const renderBlock = (b: ReadBlock, k: number) => {
    const from = blockStarts[k] ?? 0;
    if (b.kind === "heading") {
      return createElement(`h${b.level}`, { className: "sq-read-h" }, spanNodes(b.sentences, from));
    }
    if (b.kind === "paragraph") return <p>{spanNodes(b.sentences, from)}</p>;
    if (b.kind === "quote") {
      return (
        <blockquote>
          <p>{spanNodes(b.sentences, from)}</p>
        </blockquote>
      );
    }
    if (b.kind === "code") {
      return (
        <div
          className="sq-read-code"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(b.source) }}
        />
      );
    }
    let offset = from;
    const items = b.items.map((item, m) => {
      const nodes = spanNodes(item, offset);
      offset += item.length;
      return <li key={m}>{nodes}</li>;
    });
    return b.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
  };

  /* --- keyboard --------------------------------------------------------- */

  // No dep array: registered every render so no handler can go stale (the QuizRunner rule).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A key event can land on something that is not an element (window itself), so the
      // "am I typing?" probe has to be an element question, not a method call on a maybe.
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("input, textarea, select")) return;

      if (e.key === "Escape") {
        e.preventDefault();
        if (veiled) {
          setVeiled(false);
          reading.play();
        } else {
          reading.pause();
          setVeiled(true);
        }
        return;
      }

      if (e.key === " " || e.key === "Spacebar") {
        // Space on a focused control is the browser's own activation — one toggle, not two.
        if (target?.closest("button, a")) return;
        e.preventDefault();
        if (veiled) {
          setVeiled(false);
          reading.play();
        } else {
          reading.toggle();
        }
        return;
      }

      if (veiled) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (e.shiftKey) reading.seek(10);
        else reading.next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (e.shiftKey) reading.seek(-10);
        else reading.previous();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* Keep the sentence being read in view — chapter scroll, driven by the voice. */
  useEffect(() => {
    if (index < 0) return;
    document
      .getElementById(`sq-read-s-${index}`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [index]);

  /* --- portal ----------------------------------------------------------- */

  const voiceOptions = reading.voices.map((v) => ({
    value: v.voiceURI,
    label: `${v.name} (${v.lang})`,
  }));

  return createPortal(
    <div className="sq-quiz-stage" role="dialog" aria-modal="true" aria-label={`Reading: ${title}`}>
      <div className="sq-quiz-frame sq-read-frame">
        <header className="sq-quiz-top">
          <div
            className="sq-quiz-bar"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Reading position"
          >
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="sq-quiz-meta">
            <span className="sq-quiz-count">
              {index >= 0
                ? `Sentence ${index + 1} of ${sentences.length}`
                : `${sentences.length} sentences`}
            </span>
            <span className="sq-quiz-clock">{title}</span>
            {reading.silentNote && <Chip tone="warn">{reading.silentNote}</Chip>}
            <Button
              size="sm"
              variant={explain ? "primary" : "secondary"}
              onClick={() => void askExplain()}
              disabled={ai.status === "running" || !noteId || index < 0 || availability !== "ready"}
              title={explainTitle}
            >
              {ai.status === "running" ? "Explaining…" : "Explain this"}
            </Button>
            <IconButton onClick={onClose} title="Close the reader" aria-label="Close the reader">
              ✕
            </IconButton>
          </div>
          <div className="sq-read-settings">
            <Picker
              label="Voice"
              value={reading.voiceURI}
              placeholder="Default voice"
              options={voiceOptions}
              onChange={(v) => reading.setVoice(v)}
              disabled={reading.mode === "silent"}
            />
            <Picker
              label="Pitch"
              value={String(reading.pitch)}
              options={PITCHES}
              onChange={(v) => reading.setPitch(Number(v ?? 1))}
              disabled={reading.mode === "silent"}
            />
          </div>
        </header>

        <main className="sq-quiz-question sq-read-body" aria-label="Note">
          {blocks.length === 0 ? (
            <p className="sq-ai-empty">This note has nothing to read yet.</p>
          ) : (
            blocks.map((b, k) => (
              <Fragment key={k}>
                {renderBlock(b, k)}
                {explain?.block === k && (
                  <div className="sq-read-explain" aria-live="polite">
                    <div className="sq-read-explain-head">
                      <span className="sq-ai-kicker">Explain this</span>
                      <span className="sq-read-explain-quote">
                        “
                        {explain.sentence.length > 140
                          ? `${explain.sentence.slice(0, 139)}…`
                          : explain.sentence}
                        ”
                      </span>
                      <IconButton
                        onClick={dismissExplain}
                        title="Dismiss"
                        aria-label="Dismiss explanation"
                      >
                        ✕
                      </IconButton>
                    </div>
                    {ai.status === "error" && (
                      <div className="sq-error" role="alert">
                        {ai.error}
                      </div>
                    )}
                    {ai.status === "running" && !ai.text && (
                      <span className="sq-help">Writing…</span>
                    )}
                    {ai.text && (
                      <div
                        className="sq-read-explain-body"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(ai.text) }}
                      />
                    )}
                  </div>
                )}
              </Fragment>
            ))
          )}
        </main>

        <footer className="sq-quiz-foot">
          <span className="sq-quiz-hint">
            Space read · ← → sentence · Shift+← → ±10s · Esc pause · click a sentence to jump
          </span>
          <div className="sq-quiz-nav sq-read-transport">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => reading.seek(-10)}
              disabled={index < 0}
              title="Back 10 seconds"
            >
              −10s
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={reading.previous}
              disabled={index < 0}
              aria-label="Previous sentence"
              title="Previous sentence"
            >
              ‹
            </Button>
            <Button size="sm" onClick={reading.toggle}>
              {phase === "playing" ? "Pause" : phase === "done" ? "Read again" : "Read"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={reading.next}
              disabled={index < 0}
              aria-label="Next sentence"
              title="Next sentence"
            >
              ›
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => reading.seek(10)}
              disabled={index < 0}
              title="Forward 10 seconds"
            >
              +10s
            </Button>
            <Picker
              label="Speed"
              value={String(reading.rate)}
              options={RATES}
              onChange={(v) => reading.setRate(Number(v ?? 1))}
            />
          </div>
        </footer>

        {veiled && (
          <div className="sq-quiz-pause">
            <div className="sq-quiz-pause-card" role="dialog" aria-label="Reading paused">
              <h3>Paused</h3>
              <p>Your place holds — resume here, or close and come back to the note itself.</p>
              <div className="sq-quiz-actions">
                <Button
                  onClick={() => {
                    setVeiled(false);
                    reading.play();
                  }}
                >
                  Resume
                </Button>
                <Button variant="secondary" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

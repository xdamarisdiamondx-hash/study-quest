/**
 * Card study (P9): the theatre where a due queue is worked through.
 *
 * Same stage the quiz runner takes — a flashcard session is exactly as absorbing,
 * so it gets the same fixed frame, progress bar and keyboard: Space flips, 1–4
 * rate (each button also showing the interval that rating would set — the same
 * schedule() the server will run, previewed before the press), Esc pauses.
 *
 * Recovery here needs no draft. Ratings post as one batch — on finishing, on
 * Save-and-close, and best-effort on unmount — and the batch id makes every post
 * of a session idempotent server-side, so a flush after a crash cannot apply a
 * schedule twice. A rating that never arrives simply leaves its card due: the
 * next queue offers it again, which is the only honest way to lose a study
 * session — the cards themselves were never at risk.
 */
import { useEffect, useRef, useState, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import { Button, Chip } from "@sq/ui";
import { RATING_LABEL, schedule, type Rating } from "@sq/core/flashcards";

import type { CardView, StudyOutcome } from "../../lib/flashcardsApi";

/** Ascending quality, left to right — the number keys match their order. */
const RATINGS: Rating[] = ["again", "hard", "good", "easy"];

const when = (days: number) => (days === 0 ? "today" : days === 1 ? "1 day" : `${days} days`);

export interface CardStudyProps {
  title: string;
  cards: CardView[];
  /**
   * Post the session. Every call carries the same batch id, so overlapping
   * flushes (exit racing unmount) resolve to one applied schedule.
   */
  submit: (body: {
    batchId: string;
    reviews: { cardId: string; rating: Rating; durationMs: number }[];
  }) => Promise<StudyOutcome>;
  /** After the summary, or from Save-and-close — returns to wherever this began. */
  onExit: () => void;
}

type Phase = "running" | "sending" | "done";

export function CardStudy({ title, cards, submit, onExit }: CardStudyProps) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ratings, setRatings] = useState<Record<string, { rating: Rating; durationMs: number }>>(
    {},
  );
  const [paused, setPaused] = useState(false);
  const [phase, setPhase] = useState<Phase>("running");
  const [outcome, setOutcome] = useState<StudyOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = cards[Math.min(index, cards.length - 1)];
  const rated = Object.keys(ratings).length;
  const allRated = rated >= cards.length;

  /* One batch id for the whole session — claimed lazily so render stays pure. */
  const batchRef = useRef<string | null>(null);
  const batchId = () => (batchRef.current ??= crypto.randomUUID());

  /* Front-shown-to-rating time for the card on screen; paused time is taken
     back out on resume so a coffee break is not billed to a card. */
  const shownAtRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);
  useEffect(() => {
    shownAtRef.current = Date.now();
  }, [index]);
  /* Mirror for the cleanup writer — refs written during render are the stale
     bug this whole pattern exists to avoid. */
  const stateRef = useRef({ ratings, phase });
  useEffect(() => {
    stateRef.current = { ratings, phase };
  });

  const send = async (map: Record<string, { rating: Rating; durationMs: number }>) => {
    setPhase("sending");
    setError(null);
    try {
      const result = await submit({
        batchId: batchId(),
        reviews: Object.entries(map).map(([cardId, r]) => ({ cardId, ...r })),
      });
      setOutcome(result);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The session could not be saved.");
      setPhase("running");
    }
  };

  const rate = (rating: Rating) => {
    if (!current || !flipped || phase !== "running") return;
    const durationMs = Math.min(Math.max(Date.now() - shownAtRef.current, 0), 3_600_000);
    const next = { ...ratings, [current.id]: { rating, durationMs } };
    setRatings(next);
    if (index + 1 < cards.length) {
      setIndex(index + 1);
      setFlipped(false);
    } else {
      void send(next); // queue exhausted — the batch goes up without being asked
    }
  };

  const pause = () => {
    pausedAtRef.current = Date.now();
    setPaused(true);
  };

  const resume = () => {
    if (pausedAtRef.current !== null) {
      shownAtRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
    setPaused(false);
  };

  /** Save-and-close: flush what is rated, then leave. A failed flush keeps the
      veil up with the message — a rating is never dropped in silence. */
  const saveAndClose = async () => {
    setError(null);
    if (Object.keys(stateRef.current.ratings).length > 0) {
      setPhase("sending");
      try {
        await submit({
          batchId: batchId(),
          reviews: Object.entries(stateRef.current.ratings).map(([cardId, r]) => ({
            cardId,
            ...r,
          })),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "The session could not be saved.");
        setPhase("running");
        return;
      }
    }
    onExit();
  };

  /* Mirror for the same reason: the submit prop is an inline arrow in every
     parent, so it changes identity on each of their renders. */
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });

  /* Closing the tab or the panel underneath: flush whatever is rated. Best
     effort by nature — if it fails the cards stay due, which is exactly the
     recovery. Mounted once, so it can only ever fire on a real unmount or
     unload: keying it on `submit` would flush on every re-render of the
     parent, and because a flush invalidates the very queries that re-render
     the parent, that loop sustains itself (P9 verification caught it as 55
     posts and a crashed tab). Only a batch still "running" flushes — one
     already sending carries itself, one done has been taken. */
  useEffect(() => {
    const flush = () => {
      const { ratings: map, phase: p } = stateRef.current;
      if (p !== "running" || Object.keys(map).length === 0) return;
      void submitRef
        .current({
          batchId: (batchRef.current ??= crypto.randomUUID()),
          reviews: Object.entries(map).map(([cardId, r]) => ({ cardId, ...r })),
        })
        .catch(() => {});
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, []);

  /* Keyboard: registered every render so no handler goes stale mid-session. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.tagName === "TEXTAREA" || target?.tagName === "INPUT";
      const onButton = target?.tagName === "BUTTON";

      if (e.key === "Escape") {
        e.preventDefault();
        if (paused) resume();
        else pause();
        return;
      }
      if (paused || phase !== "running" || typing || !current) return;

      // Space and Enter on a focused button already activate it natively —
      // acting again here would flip and unflip in the same press.
      if ((e.key === " " || e.key === "Enter") && onButton) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (/^[1-4]$/.test(e.key)) {
        const pick = RATINGS[Number(e.key) - 1];
        if (pick && flipped) {
          e.preventDefault();
          rate(pick);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* Swipe: horizontal movement flips the card — the touch twin of Space. */
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent<HTMLButtonElement>) => {
    const t = e.touches[0];
    if (!t) return;
    touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: TouchEvent<HTMLButtonElement>) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start || paused || phase !== "running") return;
    const end = e.changedTouches[0];
    if (!end) return;
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) setFlipped((f) => !f);
  };

  const progress = ((index + 1) / Math.max(cards.length, 1)) * 100;

  if (!current) return null;

  return createPortal(
    <div
      className="sq-quiz-stage"
      role="dialog"
      aria-modal="true"
      aria-label={`Flashcards: ${title}`}
    >
      <div className="sq-quiz-frame">
        <header className="sq-quiz-top">
          <div
            className="sq-quiz-bar"
            role="progressbar"
            aria-valuenow={index + 1}
            aria-valuemin={1}
            aria-valuemax={cards.length}
            aria-label="Session progress"
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="sq-quiz-meta">
            <span className="sq-quiz-count">
              Card {index + 1} of {cards.length}
            </span>
            <span className="sq-quiz-clock">{title}</span>
            {rated > 0 && <Chip tone="ok">{rated} rated</Chip>}
            <Button size="sm" variant="secondary" onClick={pause} disabled={phase === "sending"}>
              Pause
            </Button>
          </div>
        </header>

        {phase === "done" ? (
          <main className="sq-quiz-question sq-deck-done">
            <span className="sq-ai-kicker">Session saved</span>
            <h2>
              {rated} card{rated === 1 ? "" : "s"} reviewed
            </h2>
            <div className="sq-deck-done-ratings">
              {RATINGS.filter((r) => Object.values(ratings).some((v) => v.rating === r)).map(
                (r) => (
                  <Chip key={r} tone={r === "again" ? "warn" : "neutral"}>
                    {Object.values(ratings).filter((v) => v.rating === r).length}{" "}
                    {RATING_LABEL[r].toLowerCase()}
                  </Chip>
                ),
              )}
              {(outcome?.xpAwarded ?? 0) > 0 && <Chip tone="ok">+{outcome?.xpAwarded} XP</Chip>}
            </div>
            <p className="sq-ai-empty">
              Cards you rated Review are already due again — everything else waits out its interval.
            </p>
            <Button onClick={onExit}>Done</Button>
          </main>
        ) : (
          <main className="sq-quiz-question">
            <div className="sq-flip-wrap">
              <button
                type="button"
                className={`sq-flip ${flipped ? "sq-flip-on" : ""}`}
                aria-pressed={flipped}
                aria-label={flipped ? "Show the front again" : "Flip the card"}
                disabled={phase === "sending"}
                onClick={() => setFlipped((f) => !f)}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
              >
                <span className="sq-flip-inner">
                  <span className="sq-flip-face sq-flip-front" aria-hidden={flipped}>
                    <span className="sq-flip-kicker">Front</span>
                    <span className="sq-flip-text">{current.front}</span>
                  </span>
                  <span className="sq-flip-face sq-flip-back" aria-hidden={!flipped}>
                    <span className="sq-flip-kicker">Back</span>
                    <span className="sq-flip-text">{current.back}</span>
                  </span>
                </span>
              </button>
            </div>

            <p className="sq-flip-hint">
              {flipped
                ? "Did it come back? Rate it — the interval each choice sets is shown on it."
                : "Tap or press Space to flip — say the answer first."}
            </p>

            <div className="sq-deck-rates" role="group" aria-label="Rate this card">
              {RATINGS.map((r, i) => {
                // The exact interval the server will store for this choice —
                // schedule() is pure over the card, so this preview is the value.
                const preview = when(schedule(current, r, new Date()).intervalDays);
                return (
                  <button
                    key={r}
                    type="button"
                    className={`sq-deck-rate ${r === "again" ? "sq-deck-rate-again" : ""}`}
                    disabled={!flipped || phase === "sending"}
                    title={`Next review in ${preview}`}
                    onClick={(e) => {
                      e.currentTarget.blur(); // the next card starts with focus on nothing
                      rate(r);
                    }}
                  >
                    <span className="sq-deck-key" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span>{RATING_LABEL[r]}</span>
                    <span className="sq-deck-when">{preview}</span>
                  </button>
                );
              })}
            </div>
          </main>
        )}

        <footer className="sq-quiz-foot">
          <span className="sq-quiz-hint">Space flip · 1–4 rate · Esc pause</span>
          <div className="sq-quiz-nav">
            {phase === "done" ? (
              <Button onClick={onExit}>Done</Button>
            ) : allRated && phase === "running" ? (
              // The final auto-post failed: an explicit way to try it again.
              <Button onClick={() => void send(ratings)}>
                {error ? "Try again" : "Save session"}
              </Button>
            ) : (
              <span className="sq-help">
                {rated} of {cards.length} rated
              </span>
            )}
          </div>
        </footer>

        {error && phase !== "sending" && (
          <p className="sq-error sq-quiz-error" role="alert">
            {error}
          </p>
        )}

        {paused && (
          <div className="sq-quiz-pause">
            <div className="sq-quiz-pause-card" role="dialog" aria-label="Session paused">
              <h3>Paused</h3>
              <p>
                Cards you have rated are saved as you go. Leave, and only the cards you have not
                reached are still waiting.
              </p>
              {error && (
                <p className="sq-error" role="alert">
                  {error}
                </p>
              )}
              <div className="sq-quiz-actions">
                <Button onClick={resume}>Resume</Button>
                <Button
                  variant="secondary"
                  disabled={phase === "sending"}
                  onClick={() => void saveAndClose()}
                >
                  {phase === "sending" ? "Saving…" : "Save and close"}
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

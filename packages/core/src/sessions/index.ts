/**
 * Study sessions: the timer, the guided journey, the log's arithmetic (P14, PRD §26).
 *
 * Three modes share one rule — the clock is always derived from timestamps, never from
 * ticks — so a tab in the background, a laptop that slept, or a reload mid-session all
 * show the same honest number. Nothing here reads a clock by itself: every function
 * takes `now` (or a total) and can be tested with fixed numbers.
 */

export const SESSION_MODES = ["quick", "focus", "guided"] as const;
export type SessionMode = (typeof SESSION_MODES)[number];

/* --- the timer ------------------------------------------------------------ */

export interface TimerState {
  /** Epoch ms the session started — the server's `startedAt`, the one truth. */
  startedAt: number;
  /** Epoch ms the current pause began, or null while running. */
  pausedAt: number | null;
  /** Milliseconds spent in earlier pauses of this session. */
  pausedAccumMs: number;
}

/** Running or paused — the clock reads the pause boundary instead of the wall. */
export function elapsedMs(state: TimerState, now: number): number {
  const end = state.pausedAt ?? now;
  return Math.max(0, end - state.startedAt - state.pausedAccumMs);
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.pausedAt !== null) return state;
  return { ...state, pausedAt: now };
}

export function resume(state: TimerState, now: number): TimerState {
  if (state.pausedAt === null) return state;
  const spent = Math.max(0, now - state.pausedAt);
  return { ...state, pausedAt: null, pausedAccumMs: state.pausedAccumMs + spent };
}

/** Focus sessions count down; everything else counts up past its plan. */
export function remainingMs(plannedMin: number, state: TimerState, now: number): number {
  return Math.max(0, plannedMin * 60_000 - elapsedMs(state, now));
}

/** `m:ss`, or `h:mm:ss` past an hour — the timer face. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/**
 * The minutes a finished session logs: wall time minus the time spent paused.
 * The wall comes from the server's own timestamps; only the pause is reported.
 */
export function focusMinutes(totalMs: number, pausedMin: number): number {
  const raw = totalMs / 60_000 - Math.max(0, pausedMin);
  return Math.max(0, Math.min(1440, Math.round(raw)));
}

/* --- optional pomodoro breaks --------------------------------------------- */

export interface PomodoroPhase {
  kind: "work" | "break";
  /** 1-based: the first work stretch is 1. */
  index: number;
  remainingMs: number;
}

/**
 * Where a broken focus session is inside its work/break cycle. Breaks only ever
 * sit *between* work stretches — after the last one there is nothing to break
 * from, so the final stretch simply runs to the planned end.
 */
export function pomodoroPhase(elapsed: number, workMin = 25, breakMin = 5): PomodoroPhase {
  const workMs = Math.max(1, workMin) * 60_000;
  const cycleMs = workMs + Math.max(0, breakMin) * 60_000;
  const pos = Math.max(0, elapsed) % cycleMs;
  const index = Math.floor(Math.max(0, elapsed) / cycleMs) + 1;
  if (pos < workMs) return { kind: "work", index, remainingMs: workMs - pos };
  return { kind: "break", index, remainingMs: cycleMs - pos };
}

/* --- guided study --------------------------------------------------------- */

/** What actually exists for the topic — the guided journey is built from this. */
export interface GuidedSource {
  topicId: string;
  topicName: string;
  noteTitle: string | null;
  deckTitle: string | null;
  quizTitle: string | null;
}

/** One stage of the journey: PRD §26's Read → Understand → Practice → Quiz → Review. */
export interface SessionStepDraft {
  kind: "read" | "understand" | "practice" | "quiz" | "review";
  title: string;
  refType: "topic";
  refId: string;
}

/**
 * Assemble the guided session from the topic's real material: titles name the
 * actual note, deck and quiz when they exist, and say how to make them when
 * they do not — the journey never points at something that cannot happen.
 */
export function guidedSteps(src: GuidedSource): SessionStepDraft[] {
  const refId = src.topicId;
  return [
    {
      kind: "read",
      title: src.noteTitle ? `Read “${src.noteTitle}”` : `Read your ${src.topicName} notes`,
      refType: "topic",
      refId,
    },
    {
      kind: "understand",
      title: src.noteTitle ? `Summarise “${src.noteTitle}”` : "Summarise your notes",
      refType: "topic",
      refId,
    },
    {
      kind: "practice",
      title: src.deckTitle ? `Study “${src.deckTitle}”` : `Make ${src.topicName} flashcards`,
      refType: "topic",
      refId,
    },
    {
      kind: "quiz",
      title: src.quizTitle ? `Take “${src.quizTitle}”` : `Make a ${src.topicName} quiz`,
      refType: "topic",
      refId,
    },
    {
      kind: "review",
      title: "Review what you learned",
      refType: "topic",
      refId,
    },
  ];
}

/* --- the summary's next action -------------------------------------------- */

export interface NextActionInput {
  topicName: string;
  /** Cards currently due for the topic. */
  dueCards: number;
  hasNotes: boolean;
  hasQuiz: boolean;
}

/**
 * One suggested next step on the completion card — the smallest honest version
 * of P17's "what's next?": what is due first, then what exists, then the fix.
 */
export function nextAction(input: NextActionInput): string {
  if (input.dueCards > 0) {
    return `Study ${input.dueCards} due flashcard${input.dueCards === 1 ? "" : "s"}`;
  }
  if (input.hasQuiz) return `Take the ${input.topicName} quiz again`;
  if (input.hasNotes) return `Re-read your ${input.topicName} notes`;
  return `Add notes for ${input.topicName}`;
}

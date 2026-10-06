/**
 * The reading engine (P10) — Web Speech API, sentence by sentence.
 *
 * One utterance per sentence rather than one for the whole note: a sentence-sized utterance
 * cannot be cut off the way long ones are on some engines, `onend` gives an advance that
 * needs no timing guess, and skipping ahead is a cancel plus a fresh utterance instead of
 * asking where in a continuous stream we must be. Word `onboundary` events refine the
 * highlight inside the sentence when the voice sends them; when it does not — or when the
 * device has no voice at all — elapsed time against a deliberately generous estimate of the
 * sentence's length advances the highlight instead. That estimate *is* the show in silent
 * mode, which is the platform fallback PRD §10 asks for: no voice, still a read-along.
 *
 * Resuming restarts the current sentence rather than picking up mid-way. After an
 * explanation, hearing the sentence again from the top is the honest reading of "pause and
 * ask", and it keeps pause working on engines whose `resume()` is unreliable.
 *
 * `sentences` must be referentially stable — the theatre memos it — because the speak
 * effect keys on it and would otherwise re-speak on every render.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ReadSentence } from "@sq/core/markdown";

/** Estimated speaking pace at rate 1.0 (≈125 wpm). Deliberately generous: an over-long
 *  estimate in silent mode would flip the highlight early, never late. */
const WPS = 2.1;

const SYNTH_SUPPORTED = typeof window !== "undefined" && "speechSynthesis" in window;

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const durationOf = (text: string, rate: number) => words(text) / (WPS * rate);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export type ReadingPhase = "idle" | "playing" | "paused" | "done";
export type ReadingMode = "voice" | "silent";

export interface ReadingApi {
  /** Which sentence the highlight is on; -1 before the first play. */
  index: number;
  phase: ReadingPhase;
  mode: ReadingMode;
  /** Why there is no voice, phrased for the chip that shows it. Null in voice mode. */
  silentNote: string | null;
  voices: SpeechSynthesisVoice[];
  /** Null selects the first English voice (or the device default). */
  voiceURI: string | null;
  rate: number;
  pitch: number;
  /** 0..1 inside the current sentence. */
  progress: number;
  /** Seconds into the note, on the estimated timeline. */
  position: number;
  total: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  /** Jump ±seconds along the estimated timeline, landing on a sentence start. */
  seek: (deltaSeconds: number) => void;
  /** Click-to-read: start (or move) at sentence `i`. */
  jumpTo: (i: number) => void;
  setVoice: (uri: string | null) => void;
  setRate: (rate: number) => void;
  setPitch: (pitch: number) => void;
}

const pickVoice = (
  voices: SpeechSynthesisVoice[],
  voiceURI: string | null,
): SpeechSynthesisVoice | null => {
  if (voiceURI) return voices.find((v) => v.voiceURI === voiceURI) ?? null;
  return voices.find((v) => v.lang.toLowerCase().startsWith("en")) ?? voices[0] ?? null;
};

export function useReading(sentences: ReadSentence[]): ReadingApi {
  const [index, setIndex] = useState(-1);
  const [phase, setPhase] = useState<ReadingPhase>("idle");
  /** When the current attempt at this sentence began — the clock for estimates. */
  const [anchor, setAnchor] = useState(0);
  /** Word progress from `onboundary`, or a frozen value while paused. Null = use time. */
  const [boundary, setBoundary] = useState<number | null>(null);
  /** Advances every tick while playing so estimates re-render. */
  const [tick, setTick] = useState(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [probed, setProbed] = useState(false);
  const [voiceFailed, setVoiceFailed] = useState(false);
  const [voiceURI, setVoiceURI] = useState<string | null>(null);
  const [rate, setRateState] = useState(1);
  const [pitch, setPitchState] = useState(1);

  /** Identifies "our" utterance: every cancel we cause must ignore its own callbacks. */
  const tokenRef = useRef(0);

  const len = sentences.length;
  const voiceUsable = SYNTH_SUPPORTED && !voiceFailed && !(probed && voices.length === 0);
  const mode: ReadingMode = voiceUsable ? "voice" : "silent";
  const silentNote = voiceUsable
    ? null
    : !SYNTH_SUPPORTED
      ? "This browser cannot read aloud — following along by highlight."
      : voiceFailed
        ? "The voice stopped — following along by highlight."
        : "No voice on this device — following along by highlight.";

  const durations = useMemo(
    () => sentences.map((s) => durationOf(s.text, rate)),
    [sentences, rate],
  );
  const starts = useMemo(() => {
    const out: number[] = [];
    let t = 0;
    for (const d of durations) {
      out.push(t);
      t += d;
    }
    return out;
  }, [durations]);
  const total = useMemo(() => durations.reduce((a, b) => a + b, 0), [durations]);

  const currentDuration = (index >= 0 ? durations[index] : undefined) ?? 0;
  const progress =
    phase === "done"
      ? 1
      : index < 0
        ? 0
        : (boundary ??
          (phase === "playing" && currentDuration > 0
            ? clamp01((tick - anchor) / (currentDuration * 1000))
            : 0));
  const position =
    index < 0 ? 0 : phase === "done" ? total : (starts[index] ?? 0) + progress * currentDuration;

  /* --- speaking -------------------------------------------------------- */

  // Advance on the natural end of an utterance; at the last sentence, finish.
  const advance = useCallback(() => {
    if (index + 1 >= len) {
      setPhase("done");
      setBoundary(null);
      return;
    }
    setBoundary(null);
    setAnchor(Date.now());
    setIndex(index + 1);
  }, [index, len]);

  useEffect(() => {
    if (phase !== "playing" || mode !== "voice") return;
    const synth = window.speechSynthesis;
    const text = sentences[index]?.text;
    if (!synth || index < 0 || !text) return;

    const token = (tokenRef.current += 1);
    const utterance = new SpeechSynthesisUtterance(text);
    const chosen = pickVoice(voices, voiceURI);
    if (chosen) utterance.voice = chosen;
    utterance.rate = rate;
    utterance.pitch = pitch;

    utterance.onboundary = (e) => {
      if (tokenRef.current !== token) return;
      setBoundary(clamp01(e.charIndex / Math.max(1, text.length)));
    };
    utterance.onend = () => {
      if (tokenRef.current !== token) return;
      advance();
    };
    utterance.onerror = () => {
      // A cancel we caused reports "canceled"/"interrupted" — the token check above has
      // already ignored those, so reaching here means the voice itself failed.
      if (tokenRef.current !== token) return;
      setVoiceFailed(true);
    };

    synth.speak(utterance);
    return () => {
      // Invalidate first: the cancel below fires this utterance's own callbacks.
      tokenRef.current += 1;
      synth.cancel();
    };
    // `voices` is included on purpose: a late-arriving voice list re-picks the voice and
    // re-speaks, which is what makes the setting work on engines that report lazily.
  }, [phase, mode, index, anchor, rate, pitch, voiceURI, sentences, voices, advance]);

  /* --- clocks ---------------------------------------------------------- */

  useEffect(() => {
    if (phase !== "playing") return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setTick(now);
      const dur = ((index >= 0 ? durations[index] : undefined) ?? 0) * 1000;
      if (mode === "voice") {
        const synth = window.speechSynthesis;
        if (!synth) return;
        // Some engines pause themselves mid-utterance; asking again is the known fix.
        if (synth.speaking && synth.paused) {
          synth.resume();
          return;
        }
        // An utterance that neither ends nor speaks (voice race at start, swallowed
        // onend): the estimate takes over so the highlight can never wedge.
        if (!synth.speaking && !synth.paused && now - anchor > Math.max(4000, dur * 1.5)) {
          advance();
        }
        return;
      }
      if (dur > 0 && now - anchor >= dur) advance();
    }, 250);
    return () => window.clearInterval(id);
  }, [phase, mode, index, anchor, durations, advance]);

  // Voice lists arrive asynchronously (sometimes only after `voiceschanged`).
  useEffect(() => {
    if (!SYNTH_SUPPORTED) return;
    const synth = window.speechSynthesis;
    const load = () => setVoices(synth.getVoices());
    const timers = [
      window.setTimeout(load, 0),
      window.setTimeout(load, 400),
      window.setTimeout(load, 1200),
      window.setTimeout(() => setProbed(true), 1300),
    ];
    const onChange = () => load();
    synth.addEventListener("voiceschanged", onChange);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      synth.removeEventListener("voiceschanged", onChange);
    };
  }, []);

  // The theatre unmounting is the end of the session: never leave audio running.
  useEffect(
    () => () => {
      tokenRef.current += 1;
      if (SYNTH_SUPPORTED) window.speechSynthesis.cancel();
    },
    [],
  );

  /* --- transport ------------------------------------------------------- */

  const play = useCallback(() => {
    if (phase === "playing") return;
    setBoundary(null);
    setAnchor(Date.now());
    if (phase === "done" || index < 0) setIndex(0);
    setPhase("playing");
  }, [phase, index]);

  const pause = useCallback(() => {
    if (phase !== "playing") return;
    // Freeze the highlight where it stands, then stop: the speak effect's cleanup
    // cancels the utterance when `phase` leaves "playing".
    const elapsed = currentDuration > 0 ? (tick - anchor) / (currentDuration * 1000) : 0;
    setBoundary(clamp01(boundary ?? elapsed));
    setPhase("paused");
  }, [phase, currentDuration, tick, anchor, boundary]);

  const toggle = useCallback(() => {
    if (phase === "playing") pause();
    else play();
  }, [phase, play, pause]);

  const jumpTo = useCallback(
    (target: number) => {
      if (len === 0) return;
      setBoundary(null);
      setAnchor(Date.now());
      setIndex(Math.max(0, Math.min(len - 1, target)));
      if (phase === "done") setPhase("idle");
    },
    [len, phase],
  );

  const next = useCallback(() => jumpTo(index + 1), [jumpTo, index]);

  const previous = useCallback(() => {
    // A press near the start of a sentence means "previous sentence"; mid-way it means
    // "again", the way every player behaves.
    const elapsedMs = phase === "playing" ? tick - anchor : 0;
    jumpTo(index < 0 || elapsedMs > 1500 ? index : index - 1);
  }, [jumpTo, index, phase, tick, anchor]);

  const seek = useCallback(
    (deltaSeconds: number) => {
      if (index < 0 || len === 0) return;
      const target = position + deltaSeconds;
      let i = starts.findIndex((s, k) => target < (starts[k + 1] ?? total + 1));
      if (i < 0) i = len - 1;
      jumpTo(i);
    },
    [index, len, position, starts, total, jumpTo],
  );

  const setVoice = useCallback(
    (uri: string | null) => {
      setVoiceURI(uri);
      if (phase === "playing") {
        setBoundary(null);
        setAnchor(Date.now());
      }
    },
    [phase],
  );
  const setRate = useCallback(
    (value: number) => {
      setRateState(Math.min(2, Math.max(0.5, value)));
      // The current utterance keeps the old pace; restart so the new one applies now.
      if (phase === "playing") {
        setBoundary(null);
        setAnchor(Date.now());
      }
    },
    [phase],
  );
  const setPitch = useCallback(
    (value: number) => {
      setPitchState(Math.min(1.5, Math.max(0.5, value)));
      if (phase === "playing") {
        setBoundary(null);
        setAnchor(Date.now());
      }
    },
    [phase],
  );

  return {
    index,
    phase,
    mode,
    silentNote,
    voices,
    voiceURI,
    rate,
    pitch,
    progress,
    position,
    total,
    play,
    pause,
    toggle,
    next,
    previous,
    seek,
    jumpTo,
    setVoice,
    setRate,
    setPitch,
  };
}

/**
 * Streaming AI results into a panel (P7).
 *
 * The distinction that matters here: `result` is a finished answer, `partial` is one still
 * arriving. The UI reads `partial ?? result`, so a failed or abandoned regeneration falls
 * back to the last good answer instead of leaving an empty panel — the previous summary
 * stays readable while a new one is being written over it.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { streamAi, type StreamResult } from "./aiStream";

export type AiStatus = "idle" | "running" | "error";

export interface AiStreamState {
  /** The complete answer, from the last run that finished. */
  result: string;
  /** The text arriving right now, or null when nothing is streaming. */
  partial: string | null;
  status: AiStatus;
  error: string | null;
  /** True when the answer came from cache rather than a fresh model call. */
  cached: boolean;
  /** True when the run was stopped early, so `result` is only a beginning. */
  stopped: boolean;
}

export interface AiStreamApi extends AiStreamState {
  /** Everything currently on show: live text while streaming, the last result otherwise. */
  text: string;
  /** Start a run. `fresh` bypasses the cache (Regenerate).
   *  Resolves to the finished answer, or null if it failed or was stopped. */
  run: (path: string, body: Record<string, unknown>, fresh?: boolean) => Promise<StreamResult | null>;
  /** Stop the current run, keeping what has arrived. */
  stop: () => void;
}

export function useAiStream(): AiStreamApi {
  const [state, setState] = useState<AiStreamState>({
    result: "",
    partial: null,
    status: "idle",
    error: null,
    cached: false,
    stopped: false,
  });

  const abortRef = useRef<AbortController | null>(null);
  /** Mirrors the live text outside React state so an abort can read it synchronously. */
  const partialRef = useRef("");

  // Leaving the panel mid-answer must not leave a provider call running.
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(async (path: string, body: Record<string, unknown>, fresh = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    partialRef.current = "";

    setState((s) => ({ ...s, status: "running", error: null, cached: false, stopped: false, partial: "" }));

    try {
      const outcome = await streamAi(
        path,
        { ...body, fresh },
        (full) => {
          partialRef.current = full;
          setState((s) => ({ ...s, partial: full }));
        },
        controller.signal,
      );
      setState((s) => ({ ...s, result: outcome.text, partial: null, status: "idle", cached: outcome.cached }));
      return outcome;
    } catch (err) {
      if (controller.signal.aborted) {
        // Stopped on purpose: keep what arrived and label it as incomplete rather than
        // pretending the partial text is a finished answer.
        setState((s) => ({
          ...s,
          result: partialRef.current || s.result,
          partial: null,
          status: "idle",
          stopped: partialRef.current.length > 0,
        }));
        return null;
      }
      // The previous result survives — a failed regenerate should not empty the panel.
      setState((s) => ({
        ...s,
        partial: null,
        status: "error",
        error: err instanceof Error ? err.message : "Generation failed.",
      }));
      return null;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { ...state, text: state.partial ?? state.result, run, stop };
}

/**
 * A confirmation that fades on its own ("Saved to notes", "Copied").
 *
 * Kept as a hook rather than inlined twice because both panels need identical timing,
 * and a stale timer is how these end up clearing the wrong message.
 */
export function useFlash(fallbackMs = 2400) {
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), fallbackMs);
    return () => clearTimeout(timer);
  }, [flash, fallbackMs]);

  return [flash, setFlash] as const;
}

/**
 * Why the AI features cannot run, stated where the button is (P6, ADR-007).
 *
 * Two conditions a student should not have to discover by pressing a button and reading a
 * raw transport error: the API is not answering, and nothing on this machine is configured
 * to answer it. Both come from `/api/health`, which `useHealth` polls every fifteen seconds,
 * so each state clears itself — there is no retry to press and nothing to get wrong.
 *
 * It lives with the panels rather than in the shell because the message has to sit beside
 * the control it explains: a banner across the top of the screen would not say which button
 * is affected, or link to the one page that fixes it.
 */
import { Link } from "react-router-dom";

import { useHealth } from "../../lib/useHealth";

export type AiAvailability = "ready" | "offline" | "no_provider";

/**
 * What the AI features can do right now.
 *
 * `ready` until health has said otherwise, including while it is still loading — the first
 * paint must not disable the composer for a machine that is working perfectly well.
 */
export function useAiAvailability(): AiAvailability {
  const { health, offline } = useHealth();

  if (offline) return "offline";
  if (health && !health.ai.configured) return "no_provider";
  return "ready";
}

/** The reason Generate is disabled, in the composer next to it. Nothing when it can run. */
export function AiAvailabilityNotice({ availability }: { availability: AiAvailability }) {
  if (availability === "ready") return null;

  return (
    <div className="sq-ai-notice" role="status">
      <strong>{availability === "offline" ? "Offline" : "No model connected"}</strong>
      <span>
        {availability === "offline" ? (
          <>
            The API on this machine is not answering, so nothing can be generated or saved right
            now. Your text stays where it is — try again once it is back.
          </>
        ) : (
          <>
            No key or local model is connected yet. <Link to="/settings">Open Settings</Link> to set
            one up.
          </>
        )}
      </span>
    </div>
  );
}

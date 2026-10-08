import { useState, type FormEvent } from "react";
import { Wordmark } from "@sq/ui";

import { ApiError } from "../../lib/subjectsApi";
import { lanApi } from "../../lib/lanApi";

/**
 * The PIN gate (P20, ADR-023): while LAN mode is on, every route except the
 * gate's own answers 423 and the whole app stands behind this screen. One
 * component, so the hooks inside it never see the app's route tree change
 * underneath them.
 */
export function LanGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await lanApi.unlock(pin);
      if (result.ok) {
        onUnlocked();
        return;
      }
      setError("That PIN does not match.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError("That PIN does not match.");
      else if (err instanceof ApiError && err.status === 429)
        setError("Too many attempts — wait a moment and try again.");
      else setError("The server did not answer — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sq-gate">
      <form className="sq-card sq-gate-card" onSubmit={submit}>
        <Wordmark />
        <h1>Enter your app PIN</h1>
        <p className="sq-muted">
          Study Quest on this network is locked with a 4-digit PIN. It was chosen in Settings on the
          machine running the server.
        </p>
        <input
          className="sq-input sq-gate-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={4}
          pattern="\d{4}"
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
          aria-label="4-digit app PIN"
          aria-invalid={error !== null}
        />
        {error ? (
          <p className="sq-gate-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="sq-btn sq-btn-primary sq-btn-block"
          disabled={busy || pin.length !== 4}
        >
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

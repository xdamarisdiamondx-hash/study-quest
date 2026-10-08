/**
 * LAN access (P20, ADR-023): the switch that rebinds the API onto the network
 * and the PIN that always travels with it, plus the phone instructions —
 * including the certificate step nobody writes down: a phone only gets a
 * service worker (and therefore the offline app and the install prompt) over
 * trusted HTTPS, and a LAN address is not localhost.
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Card } from "@sq/ui";

import { lanApi, type LanStatus } from "../../lib/lanApi";

export function LanCard() {
  const [status, setStatus] = useState<LanStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Plaintext only right after a mint or a rotation — never stored, never read back. */
  const [shownPin, setShownPin] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await lanApi.status());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    lanApi
      .status()
      .then((next) => {
        if (cancelled) return;
        setStatus(next);
        setFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    setBusy(true);
    setError(null);
    setShownPin(null);
    try {
      const result = await lanApi.toggle(!(status?.enabled ?? false));
      setStatus(result.status);
      setShownPin(result.pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The switch did not move.");
    } finally {
      setBusy(false);
    }
  }

  async function newPin() {
    setBusy(true);
    setError(null);
    try {
      setShownPin((await lanApi.rotatePin()).pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "A new PIN could not be made.");
    } finally {
      setBusy(false);
    }
  }

  if (failed && !status) {
    return (
      <Card title="LAN access">
        <p className="sq-help">LAN settings could not be loaded.</p>
        <Button variant="secondary" onClick={() => void load()}>
          Try again
        </Button>
      </Card>
    );
  }

  const enabled = status?.enabled ?? false;
  const url = status?.lanIp ? `https://${status.lanIp}:4173` : null;

  return (
    <Card title="LAN access">
      <div
        className="sq-row"
        style={{ gap: "var(--s4)", alignItems: "flex-start", flexWrap: "wrap" }}
      >
        <div style={{ flex: "1 1 300px", minWidth: 0 }}>
          <p className="sq-help" style={{ marginTop: 0 }}>
            {enabled
              ? "The API is listening on your network. Everything reaching it asks for the 4-digit PIN first — other devices, other browsers, anyone on the Wi-Fi."
              : "Study Quest stays on this machine: the API listens on 127.0.0.1 only. Turn this on to reach it (and install the app) from a phone on the same network."}
          </p>
        </div>
        <div className="sq-row" style={{ gap: "var(--s3)", alignItems: "center" }}>
          <span className="sq-label">{enabled ? "On" : "Off"}</span>
          <Button
            variant={enabled ? "secondary" : "primary"}
            disabled={busy}
            onClick={() => void toggle()}
          >
            {enabled ? "Turn off" : "Turn on LAN access"}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="sq-gate-error" role="alert">
          {error}
        </p>
      ) : null}

      {enabled ? (
        <div className="sq-lan-details">
          {shownPin ? (
            <p className="sq-lan-pin">
              App PIN: <b>{shownPin}</b>
              <span className="sq-help"> Shown once — it cannot be read back later.</span>
            </p>
          ) : (
            <p className="sq-help">
              A PIN is set. Lost it? Rotate to see a new one — the old one stops working
              immediately.
            </p>
          )}

          <ol className="sq-bullets">
            <li>
              On this machine, serve the built app over HTTPS on the LAN:{" "}
              <code>scripts\lan-setup.ps1</code> once (creates a local certificate with mkcert),
              then <code>pnpm lan</code>.
            </li>
            <li>
              Install that certificate's CA on your phone (it is in{" "}
              <code>%LOCALAPPDATA% \mkcert</code>) — without it a phone refuses the service worker,
              and with no service worker there is no offline app to install.
            </li>
            {url ? (
              <li>
                On the phone, open <code>{url}</code>, enter the PIN, then browser menu →{" "}
                <b>Add to Home Screen</b>.
              </li>
            ) : (
              <li>
                On the phone, open <code>https://{"<this machine's IP"}:4173</code>, enter the PIN,
                then browser menu → <b>Add to Home Screen</b>.
              </li>
            )}
          </ol>

          <Button variant="secondary" disabled={busy} onClick={() => void newPin()}>
            {busy ? "Working…" : "Show a new PIN"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Diagnostics (P21): the local log file made reachable from the app — what
 * the server knows about itself, the tail of its log, the errors this browser
 * has recorded, and one button that copies the whole report to the clipboard.
 *
 * Nothing here phones home: the report only ever moves clipboard → wherever
 * the student chooses to paste it (§privacy, ADR-024). Secrets are absent by
 * construction — the endpoint returns config booleans, never config values.
 */
import { useEffect, useState } from "react";
import { Button, Card } from "@sq/ui";

import { clearClientErrors, getClientErrors, type ClientError } from "../../lib/capture";
import {
  copyDiagnostics,
  fetchServerDiagnostics,
  type ServerDiagnostics,
} from "../../lib/diagnostics";

export function DiagnosticsCard() {
  const [info, setInfo] = useState<ServerDiagnostics | null>(null);
  const [failed, setFailed] = useState(false);
  const [errors, setErrors] = useState<ClientError[]>([]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Every setState sits inside the async continuation, never in the effect
    // body itself (lint, ADR-021) — the same shape the LAN gate uses.
    void (async () => {
      try {
        const next = await fetchServerDiagnostics();
        if (!cancelled) {
          setInfo(next);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
      if (!cancelled) setErrors(getClientErrors());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy() {
    setBusy(true);
    const ok = await copyDiagnostics();
    setCopied(ok);
    setBusy(false);
    window.setTimeout(() => setCopied(false), 4000);
  }

  function clearErrors() {
    clearClientErrors();
    setErrors([]);
  }

  const errorCount = errors.reduce((sum, e) => sum + e.count, 0);

  return (
    <Card title="Diagnostics">
      <p className="sq-help" style={{ marginTop: 0 }}>
        Everything here stays on this machine — copy takes a plain-text report to your
        clipboard, nothing is sent anywhere.
      </p>

      <dl className="sq-diag-facts">
        <div>
          <dt>Server</dt>
          <dd>
            {failed
              ? "not reachable"
              : info
                ? `v${info.app.version} · up ${Math.max(1, Math.round(info.app.uptimeSec / 60))} min · ${info.app.driver}`
                : "…"}
          </dd>
        </div>
        <div>
          <dt>Log file</dt>
          <dd>{info?.log.exists ? `data\\logs (tail below)` : failed ? "—" : "none yet"}</dd>
        </div>
        <div>
          <dt>This browser</dt>
          <dd>{errorCount === 0 ? "no errors recorded" : `${errorCount} error${errorCount === 1 ? "" : "s"} recorded`}</dd>
        </div>
      </dl>

      <div className="sq-row" style={{ gap: "var(--s3)", flexWrap: "wrap" }}>
        <Button variant="primary" disabled={busy} onClick={() => void copy()}>
          {busy ? "Copying…" : copied ? "Copied ✓" : "Copy diagnostics"}
        </Button>
        <Button variant="ghost" disabled={errorCount === 0} onClick={clearErrors}>
          Clear browser errors
        </Button>
      </div>

      {errors.length > 0 ? (
        <details className="sq-diag-details">
          <summary>Browser errors ({errorCount})</summary>
          <ul className="sq-diag-list">
            {errors.map((e) => (
              <li key={`${e.source}:${e.message}`}>
                <code>
                  {e.t.slice(11, 19)} {e.source}
                  {e.count > 1 ? ` ×${e.count}` : ""}
                </code>{" "}
                {e.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {info?.log.lines.length ? (
        <details className="sq-diag-details">
          <summary>Server log tail ({info.log.lines.length} lines)</summary>
          <pre className="sq-diag-log">
            {info.log.lines.join("\n")}
          </pre>
        </details>
      ) : null}
    </Card>
  );
}

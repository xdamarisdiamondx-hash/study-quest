/**
 * "Copy diagnostics" (P21): one plain-text block containing everything needed
 * to understand a report — where the app thinks it is, what the server knows
 * about itself, and the error buffers from both sides.
 *
 * Assembled client-side and copied to the clipboard; nothing is transmitted
 * (§privacy, ADR-024). The server half comes from `/api/diagnostics`, which
 * is session-gated and deliberately free of secrets — config booleans and log
 * lines, never keys, never the PIN material.
 */
import { getClientErrors } from "./capture";

export interface ServerDiagnostics {
  app: {
    version: string;
    startedAt: string;
    uptimeSec: number;
    node: string;
    driver: string;
  };
  lan: { enabled: boolean };
  ai: { configured: boolean };
  storage: { provider: string };
  log: { dir: string; exists: boolean; lines: string[] };
}

export async function fetchServerDiagnostics(): Promise<ServerDiagnostics> {
  const res = await fetch("/api/diagnostics");
  if (!res.ok) throw new Error(`diagnostics ${res.status}`);
  return (await res.json()) as ServerDiagnostics;
}

/** The full report, newest facts first. Offline server → its half says so. */
export async function buildDiagnosticsText(): Promise<string> {
  const now = new Date().toISOString();
  const client = getClientErrors();

  let serverBlock: string;
  try {
    const s = await fetchServerDiagnostics();
    serverBlock = [
      `version:        ${s.app.version}`,
      `node:           ${s.app.node}`,
      `database:       ${s.app.driver}`,
      `server up since ${s.app.startedAt} (${s.app.uptimeSec}s)`,
      `lan mode:       ${s.lan.enabled ? "ON (PIN gate active)" : "off"}`,
      `ai configured:  ${s.ai.configured ? "yes" : "no"}`,
      `storage:        ${s.storage.provider}`,
      s.log.exists ? `log file:       ${s.log.dir}` : "log file:       (none yet)",
      "",
      "--- server log (tail) ---",
      ...(s.log.lines.length > 0 ? s.log.lines : ["(empty)"]),
    ].join("\n");
  } catch {
    serverBlock = "server:         unreachable (copy this while offline — the server half is missing)";
  }

  const clientBlock =
    client.length === 0
      ? "(no client errors recorded)"
      : client
          .map(
            (e) =>
              `${e.t} [${e.source}]${e.count > 1 ? ` ×${e.count}` : ""} ${e.message}`,
          )
          .join("\n");

  return [
    "=== Study Quest diagnostics ===",
    `taken:     ${now}`,
    `page:      ${location.href}`,
    `browser:   ${navigator.userAgent}`,
    `online:    ${navigator.onLine ? "yes" : "no"}`,
    `viewport:  ${window.innerWidth}×${window.innerHeight}`,
    `theme:     ${document.documentElement.dataset.theme ?? "light"}`,
    "",
    "--- client errors ---",
    clientBlock,
    "",
    "--- server ---",
    serverBlock,
    "",
  ].join("\n");
}

/** Copy the report; returns false when the clipboard refused (permissions). */
export async function copyDiagnostics(): Promise<boolean> {
  try {
    const text = await buildDiagnosticsText();
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

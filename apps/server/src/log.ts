/**
 * The local log file (P21 error reporting): everything that would otherwise
 * scroll past in a terminal, kept on disk where the "Copy diagnostics" action
 * can reach it.
 *
 * Deliberately no external reporting — §privacy and ADR-024's zero-cost rule:
 * the log lives in `data/logs/` next to the database, rotates at 1 MB keeping
 * three generations (so a crash loop cannot fill a disk), and every write is
 * best-effort: a logger that throws must never take the server down with it.
 * Lines are JSONL — one parseable object per line — while the console mirror
 * keeps the bracketed `[scope]` shape the rest of the server already prints.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Where the local log file lives: `data/logs/`, beside the database and the
 *  file store. On Vercel the bundle directory is read-only, so the log moves
 *  to the one writable directory a function has — per warm instance, which is
 *  still exactly what the Copy diagnostics action needs to read it back. */
const LOG_DIR =
  process.env.VERCEL === "1"
    ? join("/tmp", "studyquest", "logs")
    : join(__dirname, "..", "..", "..", "data", "logs");
const LOG_FILE = join(LOG_DIR, "server.log");
const MAX_BYTES = 1024 * 1024;
const KEEP_GENERATIONS = 3;

export type LogLevel = "info" | "warn" | "error";

export interface LogDetail {
  /** Stack trace, error name or any structured extra. */
  [key: string]: unknown;
}

function rotate(): void {
  // server.log → server.log.1 → … → server.log.N (oldest dropped).
  for (let i = KEEP_GENERATIONS - 1; i >= 1; i--) {
    const from = i === 1 ? LOG_FILE : `${LOG_FILE}.${i - 1}`;
    const to = `${LOG_FILE}.${i}`;
    if (existsSync(from)) renameSync(from, to);
  }
}

/**
 * Mirror a line to the console and append it to the log file.
 *
 * `scope` is the bracketed prefix the server already uses (`api`, `scheduler`,
 * `ai`, `lan`), so terminal output is unchanged by the file appearing.
 */
export function logLine(level: LogLevel, scope: string, message: string, detail?: LogDetail): void {
  const stamp = new Date().toISOString();
  const mirror = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  mirror(`[${scope}]`, message, detail ?? "");

  try {
    const line = `${JSON.stringify({ t: stamp, level, scope, message, ...(detail ?? {}) })}\n`;
    mkdirSync(LOG_DIR, { recursive: true });
    if (existsSync(LOG_FILE) && statSync(LOG_FILE).size + line.length > MAX_BYTES) rotate();
    appendFileSync(LOG_FILE, line);
  } catch {
    // Losing the file is survivable; losing the request over the log is not.
  }
}

/** Convenience wrapper: an exception, with its stack under `err`. */
export function logError(scope: string, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  logLine("error", scope, err.message, { err: err.stack ?? String(err) });
}

/**
 * The tail of the log file, oldest first — what the diagnostics action hands
 * to the student. Missing or unreadable file means no history, not an error:
 * a fresh install has never logged anything.
 */
export function recentLines(limit = 40): string[] {
  try {
    if (!existsSync(LOG_FILE)) return [];
    const lines = readFileSync(LOG_FILE, "utf8").split(/\r?\n/).filter(Boolean);
    return lines.slice(-limit);
  } catch {
    return [];
  }
}

/** Where the file lives, for the diagnostics payload to report. */
export function logFileHint(): { dir: string; exists: boolean } {
  return { dir: LOG_DIR, exists: existsSync(LOG_FILE) };
}

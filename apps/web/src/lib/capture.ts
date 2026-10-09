/**
 * The client half of P21 error reporting: a ring buffer of what went wrong in
 * this browser, kept in localStorage so it survives reloads (the error that
 * matters is often the one that killed the last session).
 *
 * No network, ever — §privacy keeps reporting local; the diagnostics action
 * reads this buffer and puts it on the clipboard for the student to send
 * wherever they like. Every access to localStorage is guarded: private modes
 * and full quota make it throw, and a broken recorder must not break the app
 * it is recording.
 */

export interface ClientError {
  /** ISO timestamp of the first occurrence. */
  t: string;
  /** "error" | "unhandledrejection" | "react" */
  source: string;
  message: string;
  /** How many times this exact message has been seen (deduplicated). */
  count: number;
}

const KEY = "sq-client-errors";
const CAP = 50;

export function getClientErrors(): ClientError[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ClientError[]) : [];
  } catch {
    return [];
  }
}

function persist(list: ClientError[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable or full: the buffer is a diagnostic nicety, not a
    // requirement — drop it rather than throw into the error we were logging.
  }
}

/**
 * Record one occurrence. Identical messages increment a count instead of
 * filling the buffer — a retry loop firing the same rejection 500 times
 * should read as "1 × 500", not as 50 copies that push out everything else.
 */
export function recordClientError(source: string, message: string): void {
  const list = getClientErrors();
  const existing = list.find((e) => e.source === source && e.message === message);
  if (existing) {
    existing.count += 1;
    persist(list);
    return;
  }
  list.push({ t: new Date().toISOString(), source, message, count: 1 });
  while (list.length > CAP) list.shift();
  persist(list);
}

export function clearClientErrors(): void {
  persist([]);
}

function reasonMessage(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  if (typeof reason === "object" && reason !== null && "message" in reason) {
    return String((reason as { message: unknown }).message);
  }
  return String(reason);
}

/** Subscribe to the two global failure channels. Call once, at boot. */
export function installErrorCapture(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (event) => {
    recordClientError("error", event.message || "Unknown error");
  });
  window.addEventListener("unhandledrejection", (event) => {
    recordClientError("unhandledrejection", reasonMessage(event.reason));
  });
}

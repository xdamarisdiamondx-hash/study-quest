/**
 * The install prompt (P20): Chrome and Edge hand the app a deferred
 * `beforeinstallprompt` that must be kept and replayed from our own button —
 * the browser shows nothing by itself. The event has no DOM node to render,
 * so the state lives in this module and is read through `useSyncExternalStore`
 * (no effects, no loops). Safari/iOS never fires the event; the card falls
 * back to the menu instructions those browsers do give.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallState {
  /** The browser is offering a real install through our button. */
  available: boolean;
  /** This window already IS the installed app. */
  installed: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;

function standalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    // iOS Safari's own flag when added to the home screen.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

let state: InstallState = { available: false, installed: standalone() };
const listeners = new Set<() => void>();

function publish(next: Partial<InstallState>): void {
  const merged = { ...state, ...next };
  if (merged.available === state.available && merged.installed === state.installed) return;
  state = merged;
  for (const listener of listeners) listener();
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInstallState(): InstallState {
  return state;
}

/** Called once from installOffline: the events are page-lifetime, not component-lifetime. */
export function watchInstallPrompt(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // no browser banner — our card is the prompt
    deferred = event as BeforeInstallPromptEvent;
    publish({ available: true });
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    publish({ available: false, installed: true });
  });
}

/** Fire the deferred prompt. Resolves with what the student chose. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  const event = deferred;
  deferred = null;
  publish({ available: false });
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome;
}

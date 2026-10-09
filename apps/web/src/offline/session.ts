/**
 * What leaves the device with the session (audit follow-up).
 *
 * The service worker keeps two kinds of the student's data in browser
 * storage: the `sq-api` cache (last-viewed API answers, for offline reading)
 * and the IndexedDB outbox (queued edits). Both are correct to keep while a
 * session lives — and wrong to keep after it ends: the next account signed in
 * on this browser could read the previous student's cached notes while
 * offline, or worse, have their queued edits replayed into their account.
 *
 * Sign-out therefore wipes both, best-effort per step: a browser that refuses
 * one store must not lose the other, and neither may fail the sign-out
 * itself (the server call has already succeeded by then). The app-shell
 * precache is deliberately NOT touched — it holds no user data, and clearing
 * it would uninstall the offline app under a student who simply signed out.
 */

import { API_CACHE } from "./caches";
import { clearQueued } from "./outbox";

export interface SessionWipeDeps {
  /** Delete one Cache Storage entry; resolves false where it never existed. */
  deleteCache: (name: string) => Promise<boolean>;
  /** Empty the offline write queue. */
  clearQueue: () => Promise<void>;
}

function defaultDeps(): SessionWipeDeps {
  return {
    deleteCache: (name) =>
      typeof caches === "undefined" ? Promise.resolve(false) : caches.delete(name),
    clearQueue: () => clearQueued(),
  };
}

/**
 * Wipe the session's local copies. Never rejects: both steps are best-effort.
 *
 * `holdQueue` exists for one case only: a sign-out that failed because the
 * network is down. The cached reads still go — they are copies that re-fetch
 * when online — but the outbox holds real in-flight edits, so it stays until
 * the session has actually ended.
 */
export async function wipeSessionCaches(
  overrides: Partial<SessionWipeDeps> & { holdQueue?: boolean } = {},
): Promise<void> {
  const { holdQueue = false, ...depOverrides } = overrides;
  const deps = { ...defaultDeps(), ...depOverrides };
  await deps.deleteCache(API_CACHE).catch(() => false);
  if (!holdQueue) await deps.clearQueue().catch(() => undefined);
}

/**
 * True when a sign-out failure is the network being down rather than the
 * session being over. Sign-out must keep the local copies in that case: the
 * cookie may still be valid server-side and queued edits belong in flight.
 * Every other rejection — including "unauthorized", which the erase flow gets
 * because the account is already gone by then — means the session is over on
 * this device and the wipe has to run.
 */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // fetch's own rejection
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : "";
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(
    message,
  );
}

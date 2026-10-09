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

/** Wipe the session's local copies. Never rejects: both steps are best-effort. */
export async function wipeSessionCaches(overrides: Partial<SessionWipeDeps> = {}): Promise<void> {
  const deps = { ...defaultDeps(), ...overrides };
  await deps.deleteCache(API_CACHE).catch(() => false);
  await deps.clearQueue().catch(() => undefined);
}

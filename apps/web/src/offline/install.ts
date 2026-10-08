/**
 * Wires the offline queue into the page (P20): wraps fetch, drains on
 * reconnect and on boot, and asks the service worker to keep draining via
 * Background Sync where the browser supports it.
 */

import { createOfflineFetch } from "./fetch";
import { dropWrite, enqueueWrite, listQueued, subscribeOutbox } from "./outbox";
import { replayOutbox } from "./replay";
import { refreshQueued, setOnline } from "./store";

/** Captured before the wrapper: replay must bypass it or an offline drain would re-queue. */
let rawFetch: typeof fetch | null = null;

let installed = false;
let syncing = false;

/** Ask the service worker to drain on the next reconnect — the page does not have
 *  to be open for the queue to move where Background Sync exists (P20). */
export function requestBackgroundSync(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.ready
    .then((registration) => {
      const sync = (
        registration as ServiceWorkerRegistration & {
          sync?: { register(tag: string): Promise<void> };
        }
      ).sync;
      return sync?.register("sq-outbox");
    })
    .catch(() => {
      // No worker registered, or no Background Sync (Safari): the page's own
      // `online` handler still drains, so nothing is lost.
    });
}

/** Drain the queue now. Concurrent calls collapse into one pass. */
export async function syncQueued(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const result = await replayOutbox({
      fetch: (path, init) => (rawFetch ?? window.fetch)(path, init),
      outbox: { list: listQueued, drop: dropWrite },
      note: (message) => console.warn("[offline]", message),
    });
    await refreshQueued();
    if (result.sent > 0 || result.dropped > 0) {
      window.dispatchEvent(new Event("sq-synced"));
    }
    if (result.remaining > 0) requestBackgroundSync();
  } finally {
    syncing = false;
  }
}

export function installOffline(): void {
  if (installed) return;
  installed = true;
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return; // no queue without IDB; reads still work via the service worker

  rawFetch = window.fetch.bind(window);
  window.fetch = createOfflineFetch({
    fetch: rawFetch,
    enqueue: async (write) => {
      await enqueueWrite({ ...write, at: Date.now() });
      void refreshQueued();
      requestBackgroundSync();
    },
  });

  window.addEventListener("online", () => {
    setOnline(true);
    void syncQueued();
  });
  window.addEventListener("offline", () => setOnline(false));

  // The service worker reports a completed background drain by message; the app
  // listens for one event name only, so translate here.
  window.addEventListener("message", (event) => {
    if ((event.data as { type?: string } | null)?.type !== "sq-synced") return;
    void refreshQueued();
    window.dispatchEvent(new Event("sq-synced"));
  });

  subscribeOutbox(() => void refreshQueued());
  void refreshQueued();
  void syncQueued(); // anything a previous offline session left behind syncs on open
}

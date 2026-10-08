/**
 * One snapshot of the offline world for the UI: is the device online, how many
 * edits are queued. Fed by the `online`/`offline` events and by the outbox's
 * own change notifications, read through `useSyncExternalStore` — so nothing
 * here is a React effect and nothing can loop (P20).
 */

import { queuedCount } from "./outbox";

export interface OfflineState {
  online: boolean;
  queued: number;
}

let online = typeof navigator === "undefined" || navigator.onLine !== false;
let queued = 0;
let state: OfflineState = { online, queued };

const listeners = new Set<() => void>();

function publish(): void {
  state = { online, queued };
  for (const listener of listeners) listener();
}

export function subscribeOffline(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getOfflineState(): OfflineState {
  return state;
}

export function setOnline(value: boolean): void {
  if (value === online) return;
  online = value;
  publish();
}

let refreshes = 0;

/** Re-read the outbox count. Concurrent calls collapse onto the newest one. */
export async function refreshQueued(): Promise<void> {
  const token = ++refreshes;
  try {
    const count = await queuedCount();
    if (token !== refreshes) return;
    if (count === queued) return;
    queued = count;
    publish();
  } catch {
    // IndexedDB unavailable (private mode): the pill stays quiet rather than
    // taking the app down with it.
  }
}

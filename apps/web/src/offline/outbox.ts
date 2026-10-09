/**
 * The offline write queue (P20, ADR-018).
 *
 * One IndexedDB row per edit that could not reach the server. Rows are keyed by an
 * auto-incrementing `seq`, so the store's own key order IS the order the student
 * made the edits — replay must preserve that sequence (an edit followed by a
 * rename has to land in that order, never interleaved).
 *
 * The module is deliberately DOM-free: the page (the `online` event) and the
 * service worker (background sync) both import it and drain the same store.
 */

export interface QueuedWrite {
  /** Insertion order, assigned by IndexedDB. */
  seq: number;
  method: string;
  /** Same-origin path, e.g. `/api/tasks/abc`. */
  path: string;
  /** Raw JSON body, or null for a body-less DELETE. */
  body: string | null;
  /** When the edit was made (epoch ms) — shown nowhere, kept for debugging. */
  at: number;
}

const DB_NAME = "sq-offline";
const STORE = "outbox";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE, { keyPath: "seq", autoIncrement: true });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("offline outbox could not open"));
    });
  }
  return dbPromise;
}

const listeners = new Set<() => void>();

/** Subscribe to queue changes (an enqueue or a drop). Used by the UI's counter. */
export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function changed(): void {
  for (const listener of listeners) listener();
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("offline outbox request failed"));
  });
}

/** Queue one edit. Resolves with the sequence number it was filed under. */
export async function enqueueWrite(write: Omit<QueuedWrite, "seq">): Promise<number> {
  const db = await openDb();
  const request = db.transaction(STORE, "readwrite").objectStore(STORE).add(write);
  const seq = await done(request as IDBRequest<IDBValidKey>);
  changed();
  return Number(seq);
}

/** The whole queue, oldest first. */
export async function listQueued(): Promise<QueuedWrite[]> {
  const db = await openDb();
  const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
  return done(request as IDBRequest<QueuedWrite[]>);
}

/** Remove one row — it either reached the server or can never be accepted. */
export async function dropWrite(seq: number): Promise<void> {
  const db = await openDb();
  await done(db.transaction(STORE, "readwrite").objectStore(STORE).delete(seq));
  changed();
}

/** How many edits are waiting — the number in the offline pill. */
export async function queuedCount(): Promise<number> {
  const db = await openDb();
  const request = db.transaction(STORE, "readonly").objectStore(STORE).count();
  return done(request);
}

/**
 * Empty the whole queue — used on sign-out. Queued edits belong to the
 * session that made them: keeping them would let them replay into whichever
 * account signs in next on this browser (P20's replay is deliberately
 * account-blind, so the boundary is here, at sign-out).
 */
export async function clearQueued(): Promise<void> {
  const db = await openDb();
  await done(db.transaction(STORE, "readwrite").objectStore(STORE).clear());
  changed();
}

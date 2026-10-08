/**
 * Drain the offline queue (P20).
 *
 * Shared by the page (the `online` event, app start) and the service worker
 * (background sync), so the rules live here rather than in either host. The
 * queue replays strictly in sequence order and stops at the first write that is
 * not cleanly accepted: a later edit must never land before an earlier one.
 */

import type { QueuedWrite } from "./outbox";

export interface OutboxPort {
  list(): Promise<QueuedWrite[]>;
  drop(seq: number): Promise<void>;
}

export interface ReplayDeps {
  /** The raw fetch — never the offline wrapper, or an offline drain would re-queue. */
  fetch(path: string, init: RequestInit): Promise<Response>;
  outbox: OutboxPort;
  note?: (message: string) => void;
}

export type ReplayStop =
  /** Every queued write reached the server. */
  | "done"
  /** Network-level failure: nothing moved, try again on the next trigger. */
  | "offline"
  /** The server answered but not with acceptance (5xx, locked, signed out, rate limit). */
  | "unavailable";

export interface ReplayResult {
  sent: number;
  dropped: number;
  remaining: number;
  stop: ReplayStop;
}

/**
 * Statuses that mean "this write will never be accepted": the row is gone, the
 * world moved on, or the payload is no longer valid. Replaying it forever cannot
 * succeed, so it is dropped and the invalidation that follows a sync shows the
 * student the server's truth. Auth (401/403), the PIN gate (423), rate limits
 * (408/429) and every 5xx are NOT in this set — those are temporary, and the
 * edit is still wanted, so the queue keeps it and waits.
 */
const PERMANENT = new Set([404, 409, 410, 412, 422]);

export async function replayOutbox(deps: ReplayDeps): Promise<ReplayResult> {
  const items = await deps.outbox.list();
  let sent = 0;
  let dropped = 0;

  for (const write of items) {
    try {
      const res = await deps.fetch(write.path, {
        method: write.method,
        body: write.body ?? undefined,
        headers: write.body ? { "content-type": "application/json" } : undefined,
        credentials: "same-origin",
      });

      if (res.ok) {
        await deps.outbox.drop(write.seq);
        sent += 1;
        continue;
      }

      if (PERMANENT.has(res.status)) {
        deps.note?.(`${write.method} ${write.path} rejected with ${res.status} — dropped`);
        await deps.outbox.drop(write.seq);
        dropped += 1;
        continue;
      }

      return { sent, dropped, remaining: items.length - sent - dropped, stop: "unavailable" };
    } catch {
      return { sent, dropped, remaining: items.length - sent - dropped, stop: "offline" };
    }
  }

  return { sent, dropped, remaining: 0, stop: "done" };
}

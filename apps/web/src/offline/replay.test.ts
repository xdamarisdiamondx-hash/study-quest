import { describe, expect, it } from "vitest";

import type { QueuedWrite } from "./outbox";
import { replayOutbox, type ReplayDeps } from "./replay";

function write(seq: number): QueuedWrite {
  return {
    seq,
    method: "PATCH",
    path: `/api/tasks/t${seq}`,
    body: JSON.stringify({ title: `edit ${seq}` }),
    at: seq,
  };
}

/** A queue that forgets dropped rows, plus the order the fetches were attempted in. */
function harness(items: QueuedWrite[], respond: (w: QueuedWrite) => Promise<Response>) {
  const dropped: number[] = [];
  const calls: number[] = [];
  const deps: ReplayDeps = {
    fetch: async (path) => {
      const seq = Number(path.slice(path.lastIndexOf("t") + 1));
      const item = items.find((w) => w.seq === seq)!;
      calls.push(seq);
      return respond(item);
    },
    outbox: {
      list: async () => items.filter((w) => !dropped.includes(w.seq)),
      drop: async (seq) => {
        dropped.push(seq);
      },
    },
  };
  return { deps, dropped, calls };
}

describe("replayOutbox", () => {
  it("sends every write in sequence order and empties the queue", async () => {
    const items = [write(1), write(2), write(3)];
    const { deps, dropped, calls } = harness(
      items,
      async () => new Response("{}", { status: 200 }),
    );

    const result = await replayOutbox(deps);

    expect(result).toEqual({ sent: 3, dropped: 0, remaining: 0, stop: "done" });
    expect(calls).toEqual([1, 2, 3]);
    expect(dropped).toEqual([1, 2, 3]);
  });

  it("stops at the first network failure and keeps the rest for the next trigger", async () => {
    const items = [write(1), write(2), write(3)];
    const { deps, dropped, calls } = harness(items, async (w) => {
      if (w.seq === 2) throw new TypeError("Failed to fetch");
      return new Response("{}", { status: 200 });
    });

    const result = await replayOutbox(deps);

    expect(result.stop).toBe("offline");
    expect(result.sent).toBe(1);
    expect(result.remaining).toBe(2); // 2 and 3 still queued, in order
    expect(calls).toEqual([1, 2]);
    expect(dropped).toEqual([1]);
  });

  it("drops a permanently rejected write and carries on with the next", async () => {
    const items = [write(1), write(2), write(3)];
    const { deps, dropped } = harness(items, async (w) =>
      w.seq === 2
        ? new Response("{}", { status: 404 }) // the row is gone — nothing to replay
        : new Response("{}", { status: 200 }),
    );

    const result = await replayOutbox(deps);

    expect(result).toEqual({ sent: 2, dropped: 1, remaining: 0, stop: "done" });
    expect(dropped).toEqual([1, 2, 3]); // dropped in the order the queue reached them
  });

  it("keeps the queue on an auth failure — a session will come back", async () => {
    const items = [write(1), write(2)];
    const { deps, dropped } = harness(items, async (w) =>
      w.seq === 1 ? new Response("{}", { status: 401 }) : new Response("{}", { status: 200 }),
    );

    const result = await replayOutbox(deps);

    expect(result.stop).toBe("unavailable");
    expect(result.sent).toBe(0);
    expect(result.remaining).toBe(2);
    expect(dropped).toEqual([]);
  });

  it("keeps the queue on a server error rather than losing the edit", async () => {
    const items = [write(1)];
    const { deps, dropped } = harness(items, async () => new Response("boom", { status: 503 }));

    const result = await replayOutbox(deps);

    expect(result).toEqual({ sent: 0, dropped: 0, remaining: 1, stop: "unavailable" });
    expect(dropped).toEqual([]);
  });

  it("sends the body and credentials with each replayed write", async () => {
    const seen: RequestInit[] = [];
    const deps: ReplayDeps = {
      fetch: async (_path, init) => {
        seen.push(init);
        return new Response("{}", { status: 200 });
      },
      outbox: {
        list: async () => [write(1)],
        drop: async () => {},
      },
    };

    await replayOutbox(deps);

    expect(seen).toHaveLength(1);
    expect(seen[0]!.method).toBe("PATCH");
    expect(seen[0]!.body).toBe(JSON.stringify({ title: "edit 1" }));
    expect(seen[0]!.credentials).toBe("same-origin");
  });
});

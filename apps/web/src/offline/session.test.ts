import { describe, expect, it } from "vitest";

import { API_CACHE } from "./caches";
import { wipeSessionCaches, type SessionWipeDeps } from "./session";

function harness() {
  const cachesWiped: string[] = [];
  let queueCleared = 0;
  const deps: SessionWipeDeps = {
    deleteCache: async (name) => {
      cachesWiped.push(name);
      return true;
    },
    clearQueue: async () => {
      queueCleared += 1;
    },
  };
  return {
    deps,
    cachesWiped,
    get queueCleared() {
      return queueCleared;
    },
  };
}

describe("wipeSessionCaches", () => {
  it("removes the API read cache and empties the outbox", async () => {
    const h = harness();

    await wipeSessionCaches(h.deps);

    expect(h.cachesWiped).toEqual([API_CACHE]);
    expect(h.queueCleared).toBe(1);
  });

  it("still empties the queue when the cache store refuses", async () => {
    const h = harness();

    await wipeSessionCaches({
      ...h.deps,
      deleteCache: async () => {
        throw new Error("Cache Storage unavailable");
      },
    });

    expect(h.queueCleared).toBe(1);
  });

  it("still wipes the cache when the queue store refuses — and never rejects", async () => {
    const h = harness();

    await expect(
      wipeSessionCaches({
        ...h.deps,
        clearQueue: async () => {
          throw new Error("IndexedDB unavailable");
        },
      }),
    ).resolves.toBeUndefined();

    expect(h.cachesWiped).toEqual([API_CACHE]);
  });
});

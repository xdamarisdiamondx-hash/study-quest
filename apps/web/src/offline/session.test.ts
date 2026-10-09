import { describe, expect, it } from "vitest";

import { API_CACHE } from "./caches";
import { isNetworkError, wipeSessionCaches, type SessionWipeDeps } from "./session";

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

  it("with holdQueue keeps the queue but still wipes the cache", async () => {
    const h = harness();

    await wipeSessionCaches({ ...h.deps, holdQueue: true });

    expect(h.cachesWiped).toEqual([API_CACHE]);
    expect(h.queueCleared).toBe(0);
  });
});

describe("isNetworkError", () => {
  it("treats fetch's own TypeError as the network being down", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("treats a better-auth style network message as the network being down", () => {
    expect(isNetworkError({ message: "NetworkError when attempting to fetch resource." })).toBe(
      true,
    );
    expect(isNetworkError(new Error("fetch failed"))).toBe(true);
  });

  it("treats an authorization rejection as the session being over", () => {
    // What the erase flow gets: the account is already gone, so sign-out
    // answers 401 — the wipe must still run.
    expect(isNetworkError({ message: "Invalid session" })).toBe(false);
    expect(isNetworkError(new Error("Unauthorized"))).toBe(false);
  });

  it("treats an abort as neither — the request was cancelled, not lost", () => {
    expect(isNetworkError(new DOMException("Aborted", "AbortError"))).toBe(false);
  });
});

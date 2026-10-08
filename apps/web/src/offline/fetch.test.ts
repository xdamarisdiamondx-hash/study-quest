import { afterEach, describe, expect, it, vi } from "vitest";

import { createOfflineFetch, type EnqueueInput } from "./fetch";

const BASE = "https://study.local/";

function wrap(real: () => Promise<Response>, captured: EnqueueInput[]) {
  return createOfflineFetch({
    fetch: (async () => real()) as typeof fetch,
    enqueue: async (write) => {
      captured.push(write);
    },
    base: BASE,
  });
}

const networkDown = () => Promise.reject(new TypeError("Failed to fetch"));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createOfflineFetch", () => {
  it("queues a failed edit and answers 202 as if the server had accepted it", async () => {
    const captured: EnqueueInput[] = [];
    const offlineFetch = wrap(networkDown, captured);

    const res = await offlineFetch("/api/tasks/t1?series=true", {
      method: "PATCH",
      body: JSON.stringify({ title: "Renamed offline" }),
    });

    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toEqual({ queued: true });
    expect(captured).toEqual([
      {
        method: "PATCH",
        path: "/api/tasks/t1?series=true",
        body: JSON.stringify({ title: "Renamed offline" }),
      },
    ]);
  });

  it("queues a body-less DELETE as null", async () => {
    const captured: EnqueueInput[] = [];
    const offlineFetch = wrap(networkDown, captured);

    const res = await offlineFetch("/api/tasks/t1", { method: "DELETE" });

    expect(res.status).toBe(202);
    expect(captured[0]).toMatchObject({ method: "DELETE", body: null });
  });

  it("passes a successful edit straight through and queues nothing", async () => {
    const captured: EnqueueInput[] = [];
    const offlineFetch = wrap(() => Promise.resolve(new Response("{}", { status: 200 })), captured);

    const res = await offlineFetch("/api/tasks/t1", { method: "PUT", body: "{}" });

    expect(res.status).toBe(200);
    expect(captured).toEqual([]);
  });

  it("never queues a GET — reads fail loudly rather than silently disappear", async () => {
    const captured: EnqueueInput[] = [];
    const offlineFetch = wrap(networkDown, captured);

    await expect(offlineFetch("/api/tasks", { method: "GET" })).rejects.toBeInstanceOf(TypeError);
    expect(captured).toEqual([]);
  });

  it("never queues a POST: creates and actions need the server's answer", async () => {
    const captured: EnqueueInput[] = [];
    const offlineFetch = wrap(networkDown, captured);

    await expect(offlineFetch("/api/notes", { method: "POST", body: "{}" })).rejects.toBeInstanceOf(
      TypeError,
    );
    expect(captured).toEqual([]);
  });

  it("leaves other origins alone", async () => {
    const captured: EnqueueInput[] = [];
    const offlineFetch = wrap(networkDown, captured);

    await expect(
      offlineFetch("https://elsewhere.test/api/tasks/t1", { method: "PUT", body: "{}" }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(captured).toEqual([]);
  });

  it("does not queue an aborted request", async () => {
    const captured: EnqueueInput[] = [];
    const offlineFetch = wrap(networkDown, captured);
    const controller = new AbortController();
    controller.abort();

    await expect(
      offlineFetch("/api/tasks/t1", { method: "PUT", body: "{}", signal: controller.signal }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(captured).toEqual([]);
  });

  it("does not queue a body it cannot replay as JSON", async () => {
    const captured: EnqueueInput[] = [];
    const offlineFetch = wrap(networkDown, captured);

    await expect(
      offlineFetch("/api/notes", {
        method: "PUT",
        body: new FormData(), // would need re-encoding; must surface, not vanish
      }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(captured).toEqual([]);
  });

  it("re-locks the app when the PIN gate answers 423", async () => {
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    const offlineFetch = wrap(() => Promise.resolve(new Response("{}", { status: 423 })), []);

    await offlineFetch("/api/me", { method: "GET" });

    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "sq:lan-locked" }),
    );
  });

  it("queues an edit when a gateway answers 502 instead of a real response", async () => {
    const captured: EnqueueInput[] = [];
    const offlineFetch = wrap(
      () => Promise.resolve(new Response("bad gateway", { status: 502 })),
      captured,
    );

    const res = await offlineFetch("/api/tasks/t1", { method: "PATCH", body: '{"done":true}' });

    expect(res.status).toBe(202);
    expect(captured).toEqual([{ method: "PATCH", path: "/api/tasks/t1", body: '{"done":true}' }]);
  });

  it("treats a 500 the same way — the write did not land and we cannot know more", async () => {
    const captured: EnqueueInput[] = [];
    const offlineFetch = wrap(() => Promise.resolve(new Response("", { status: 500 })), captured);

    const res = await offlineFetch("/api/tasks/t1", { method: "DELETE" });

    expect(res.status).toBe(202);
    expect(captured[0]).toMatchObject({ method: "DELETE", body: null });
  });

  it("never queues a GET on a 5xx — reads surface the failure, SW serves the cache", async () => {
    const captured: EnqueueInput[] = [];
    const offlineFetch = wrap(() => Promise.resolve(new Response("", { status: 503 })), captured);

    const res = await offlineFetch("/api/tasks", { method: "GET" });

    expect(res.status).toBe(503);
    expect(captured).toEqual([]);
  });

  it("never queues a POST on a 5xx — creates need the server's real answer", async () => {
    const captured: EnqueueInput[] = [];
    const offlineFetch = wrap(() => Promise.resolve(new Response("", { status: 502 })), captured);

    const res = await offlineFetch("/api/notes", { method: "POST", body: "{}" });

    expect(res.status).toBe(502);
    expect(captured).toEqual([]);
  });

  it("passes a 4xx validation failure straight through — that one reached the server", async () => {
    const captured: EnqueueInput[] = [];
    const offlineFetch = wrap(() => Promise.resolve(new Response("{}", { status: 422 })), captured);

    const res = await offlineFetch("/api/tasks/t1", { method: "PUT", body: "{}" });

    expect(res.status).toBe(422);
    expect(captured).toEqual([]);
  });
});

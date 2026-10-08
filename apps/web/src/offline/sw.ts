/**
 * Study Quest's service worker (P20, ADR-018).
 *
 * Strategy in two halves: the app shell and every hashed asset are precached
 * (cache-first, versioned — `cleanupOutdatedCaches` retires the previous
 * build's cache), while API reads are network-first with a bounded local copy
 * so "last-viewed content" answers when the network does not. Health and file
 * downloads are deliberately network-only: a cached "ok" would hide being
 * offline, and attachments follow ADR-027 ("reconnect to view").
 *
 * The worker also drains the IndexedDB outbox on a background-sync event, so
 * queued edits reach the server on reconnect even if the tab is closed.
 *
 * Typed structurally rather than with `/// <reference lib="webworker" />`:
 * the web worker lib and the DOM lib collide in one program, and this file
 * only needs the handful of members it actually touches.
 */

import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { ExpirationPlugin } from "workbox-expiration";
import { registerRoute } from "workbox-routing";
import { NetworkFirst, NetworkOnly } from "workbox-strategies";

import { dropWrite, listQueued } from "./outbox";
import { replayOutbox } from "./replay";

interface SyncEventLike {
  tag: string;
  waitUntil(promise: Promise<unknown>): void;
}

interface MessageEventLike {
  data: unknown;
}

interface ClientLike {
  postMessage(message: unknown): void;
}

interface WorkerScope {
  __WB_MANIFEST: Array<{ url: string; revision?: string | undefined }>;
  addEventListener(type: "sync", listener: (event: SyncEventLike) => void): void;
  addEventListener(type: "message", listener: (event: MessageEventLike) => void): void;
  addEventListener(type: "activate", listener: (event: unknown) => void): void;
  skipWaiting(): void;
  clients: { claim(): Promise<void>; matchAll(): Promise<ClientLike[]> };
  fetch: typeof fetch;
}

const ctx = self as unknown as WorkerScope;

// NOTE: `self.__WB_MANIFEST` must stay a LITERAL property access on `self` —
// workbox-build finds exactly that token in the built file and splices the
// revisioned precache list into it. Aliasing through `ctx` hides it from that
// search, so this one expression deliberately does not use the cast variable.
precacheAndRoute((self as unknown as WorkerScope).__WB_MANIFEST);
cleanupOutdatedCaches();

// Take over the page that registered us, mid-session: without this the FIRST
// session's API fetches would bypass the runtime cache until the next reload,
// and "previously viewed content" would silently miss whatever was viewed
// before the worker finished installing. On later updates the page reloads
// anyway (the prompt flow), so claim only ever matters here, on activate.
ctx.addEventListener("activate", () => {
  void ctx.clients.claim();
});

// Navigations — deep links, reloads, the installed app's start_url — fall back
// to the precached shell and the SPA router takes it from there.
registerRoute(({ request }) => request.mode === "navigate", createHandlerBoundToURL("index.html"));

// Health must tell the truth: a cached "ok" would hide being offline.
registerRoute(({ url }) => url.pathname === "/api/health", new NetworkOnly());

// Attachments stay network-only (ADR-027): "reconnect to view", never stale bytes.
registerRoute(({ url }) => url.pathname.startsWith("/api/files/"), new NetworkOnly());

// Everything else the API reads: network first, this device's last answer when
// offline OR when a gateway reports the server unreachable (500/502/503/504 —
// vite's proxy, a tunnel, a reverse proxy: all indistinguishable from being
// offline at the client, and stale data beats no data for a study app). The
// health route stays network-only above so the offline signal never lies. The
// expiration plugin is the versioned cleanup — LRU plus an age cap keeps the
// runtime cache from growing forever.
const apiReads = new NetworkFirst({
  cacheName: "sq-api",
  networkTimeoutSeconds: 4,
  plugins: [new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 14 * 24 * 60 * 60 })],
});

registerRoute(
  ({ url, request }) => url.pathname.startsWith("/api/") && request.method === "GET",
  async (ctx) => {
    const res = await apiReads.handle(ctx);
    if (res && res.status >= 500) {
      const cached = await caches.match(ctx.request, { cacheName: "sq-api" });
      if (cached) return cached;
    }
    return res;
  },
);

ctx.addEventListener("sync", (event) => {
  if (event.tag === "sq-outbox") event.waitUntil(drain());
});

ctx.addEventListener("message", (event) => {
  // The prompt-style update flow: the waiting worker takes over only when the
  // student presses Reload (AppShell), which posts this message first.
  if ((event.data as { type?: string } | null)?.type === "SKIP_WAITING") ctx.skipWaiting();
});

/** Send the queue in order, then tell any open page to refetch. */
async function drain(): Promise<void> {
  const result = await replayOutbox({
    fetch: (path, init) => ctx.fetch(path, init),
    outbox: { list: listQueued, drop: dropWrite },
    note: (message) => console.warn("[offline]", message),
  });
  if (result.sent > 0 || result.dropped > 0) {
    const clients = await ctx.clients.matchAll();
    for (const client of clients) client.postMessage({ type: "sq-synced" });
  }
}

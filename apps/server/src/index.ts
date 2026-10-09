/**
 * Study Quest API server — the long-lived local process (ADR-017).
 *
 * Runs on 127.0.0.1:4321. The database is PostgreSQL (Docker, ADR-028) when
 * DATABASE_URL is set, otherwise PGlite in-process — so the app runs before
 * Docker is configured.
 *
 * Everything the app *serves* lives in app.ts; this file is what a desktop
 * install has that a serverless function does not: a bound port, the built
 * web app from disk, the reminder scheduler and the LAN rebind. (Vercel's
 * entry is vercel.ts — the same app, none of this.)
 */
import { createReadStream } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Deliberately the first import: it puts `.env` in process.env before any module
// below is evaluated. See env.ts — a config() call in this file's body would run
// too late, because imports hoist above it.
import "./env.ts";

import { serve } from "@hono/node-server";

import { app } from "./app.ts";
import { ensureLanMatchesHost, lanEnabled, setRebinder } from "./lan.ts";
import { startScheduler } from "./scheduler.ts";
import { resolveWeb } from "./web.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 4321);
const HOST = process.env.HOST ?? "127.0.0.1";

/* --- the built web app, from the same process as the API (P22) ------------
   Registered last, so every /api route above keeps answering for itself and
   anything unmatched that looks like a page gets the SPA shell instead of a
   JSON 404. See web.ts for the two rules and the cache policy. */
const WEB_DIST = join(__dirname, "..", "..", "web", "dist");
app.on(["GET", "HEAD"], "*", (c) => {
  let requestPath = c.req.path;
  try {
    requestPath = decodeURIComponent(requestPath);
  } catch {
    return c.notFound(); // a malformed escape is not ours to guess at
  }

  const found = resolveWeb(WEB_DIST, requestPath);
  if (!found) return c.notFound();

  const headers: Record<string, string> = {
    "Content-Type": found.contentType,
    "Cache-Control": found.cacheControl,
    "X-Content-Type-Options": "nosniff",
  };
  if (c.req.method === "HEAD") return new Response(null, { headers });
  return new Response(createReadStream(found.path) as unknown as ReadableStream, { headers });
});

/* --- LAN mode (P20): the bind decides whether a PIN is mandatory ---------- */
const boot = ensureLanMatchesHost(HOST);
if (boot.onNetwork && boot.minted) {
  console.log(`[lan] LAN access is ON — app PIN: ${boot.minted}`);
} else if (boot.onNetwork) {
  console.log("[lan] LAN access is ON (PIN already configured — Settings → LAN).");
} else if (lanEnabled()) {
  console.log(
    "[lan] PIN gate is on while HOST stays loopback — nobody on the network can reach this process.",
  );
}

const server = serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
  console.log(`Study Quest API listening on http://${HOST}:${info.port}`);
  console.log(`  health: http://${HOST}:${info.port}/api/health`);
  console.log(`  sign in: http://localhost:5173`);
  // The tick lives inside this long-running serve only — a serverless host has
  // no process to hold a timer, and gets the same reminder sync through
  // /api/cron/tick instead (routes/cron.ts). ADR-017 keeps the scheduler
  // in-process wherever there is a process.
  startScheduler();
});

// Rebinding for the LAN toggle (P20): Node cannot move a bound socket between
// interfaces in place, so close the listener and re-open it on the other
// address. Same port, same process — sessions, the scheduler and the database
// are untouched.
setRebinder(async (enabled: boolean) => {
  // HTTP/1 only — @hono/node-server's union type also admits HTTP/2, which
  // has no force-close; dropping its idle connections is harmless anyway.
  if ("closeAllConnections" in server) server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => reject(err);
    server.once("error", onError);
    server.listen(PORT, enabled ? "0.0.0.0" : "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
  console.log(`[lan] listening on ${enabled ? "0.0.0.0" : "127.0.0.1"}:${PORT}`);
});

/**
 * Study Quest API server.
 *
 * Runs locally on 127.0.0.1:4321. The database is PostgreSQL (Docker, ADR-028) when
 * DATABASE_URL is set, otherwise PGlite in-process — so the app runs before Docker is
 * configured.
 */
import { createReadStream } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Deliberately the first import: it puts `.env` in process.env before any module
// below is evaluated. See env.ts — a config() call in this file's body would run
// too late, because imports hoist above it.
import "./env.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

import { serve } from "@hono/node-server";
import { bodyLimit } from "hono/body-limit";
import { eq } from "drizzle-orm";
import { Hono, type Context } from "hono";

import * as dbSchema from "@sq/db/schema";

import { createAuth, ensureProfile } from "./auth.ts";
import type { AuthedEnv } from "./auth/session.ts";
import { getSession } from "./auth/session.ts";
import { ensureLanMatchesHost, isUnlocked, lanEnabled, setRebinder } from "./lan.ts";
import { createLimiter } from "./ratelimit.ts";
import { db } from "./db.ts";
import { aiErrorStatus, AiError } from "./ai/types.ts";
import { anyEnvConfigured } from "./ai/settings.ts";
import { onboarding } from "./routes/onboarding.ts";
import { subjectsRouter } from "./routes/subjects.ts";
import { notesRouter } from "./routes/notes.ts";
import { aiRouter } from "./routes/ai.ts";
import { quizzesRouter } from "./routes/quizzes.ts";
import { flashcardsRouter } from "./routes/flashcards.ts";
import { tasksRouter } from "./routes/tasks.ts";
import { planRouter } from "./routes/plan.ts";
import { questsRouter } from "./routes/quests.ts";
import { sessionsRouter } from "./routes/sessions.ts";
import { gamificationRouter } from "./routes/gamification.ts";
import { progressRouter } from "./routes/progress.ts";
import { recommendationsRouter } from "./routes/recommendations.ts";
import { remindersRouter } from "./routes/reminders.ts";
import { searchRouter } from "./routes/search.ts";
import { lanRouter } from "./routes/lan.ts";
import { diagnosticsRouter } from "./routes/diagnostics.ts";
import { dataRouter } from "./routes/data.ts";
import { logError } from "./log.ts";
import { ensureReferenceData } from "./services/reference.ts";
import { startScheduler } from "./scheduler.ts";
import { fileStore } from "./files/store.ts";
import { resolveWeb } from "./web.ts";

const { users } = dbSchema;

const PORT = Number(process.env.PORT ?? 4321);
const HOST = process.env.HOST ?? "127.0.0.1";
const BASE_URL = process.env.BASE_URL ?? process.env.BETTER_AUTH_URL ?? `http://${HOST}:${PORT}`;

console.log(`[db] driver: ${db.driver}`);

/**
 * Reference data before anything reads it: `user_achievements.achievement_code` is a
 * foreign key into `achievements`, so a database that was migrated but never seeded
 * answers every gamification read with a 23503 — which is what the live Neon branch
 * did until the server started writing the catalogue itself. One round trip on an
 * already-probed pool; a failure is logged rather than fatal, because the app still
 * serves and `pnpm db:seed` can retry it.
 */
try {
  const written = await ensureReferenceData(db.orm);
  console.log(
    `[seed] reference data ready: ${written.levels} levels, ${written.achievements} achievements`,
  );
} catch (err) {
  logError("boot:reference-data", err);
}

const auth = createAuth({
  orm: db.orm,
  baseURL: BASE_URL,
  isProduction: process.env.NODE_ENV === "production",
});

const app = new Hono<AuthedEnv>();

/** Make the Better Auth instance available to every route. */
app.use("*", async (c, next) => {
  c.set("auth", auth);
  await next();
});

/* --- LAN gate (P20, ADR-023): while LAN mode is on, a 4-digit PIN issued by
   /api/lan/unlock stands between the network and every other route. Health, the
   gate's own routes and /api/me are exempt: the UI needs them to decide whether
   to show the gate and whether a session exists behind it, and none of them
   reveal study data without a valid session cookie. */
app.use("/api/*", async (c, next) => {
  if (!lanEnabled()) return next();
  const path = c.req.path;
  if (
    path === "/api/health" ||
    path === "/api/lan/status" ||
    path === "/api/lan/unlock" ||
    path === "/api/me"
  ) {
    return next();
  }
  if (isUnlocked(c.req.header("cookie"))) return next();
  return c.json({ error: "lan_locked", message: "Enter the app PIN to continue." }, 423);
});

/* --- auth: Better Auth owns every route under /api/auth/* -------------- */
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

/* --- security headers and body cap (P21 review) --------------------------
   Headers on every response the API makes. Body caps: 12 MB for everything
   (10 MB attachments plus multipart overhead, so a stray upload cannot ask
   Node to buffer an unbounded request), and 250 MB for /api/import alone —
   that one carries every attachment in the archive. A document CSP
   deliberately lives with the process that serves the document (Vite
   dev/preview, or whatever fronts this in production) — setting it here would
   claim a protection for pages this server never serves. */
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "SAMEORIGIN");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), usb=()");
  c.header("Cross-Origin-Opener-Policy", "same-origin");
});

const jsonBodyLimit = bodyLimit({ maxSize: 12 * 1024 * 1024 });
const importBodyLimit = bodyLimit({ maxSize: 250 * 1024 * 1024 });

app.use("/api/*", async (c, next) => {
  // /api/import gets its own, larger cap below: an export carries every
  // attachment, and a backup you cannot restore is not a backup.
  const limit = c.req.path === "/api/import" ? importBodyLimit : jsonBodyLimit;
  return limit(c, next);
});

/* --- rate limits (P21): auth writes and AI runs, keyed by caller ----------
   Better Auth only limits itself in production, so without this a dev or LAN
   session had nothing at all; the daily AI cap prices generations but does not
   slow a hammer. Both budgets are deliberately generous for a human — this
   damps scripts, it is not a queue. When LAN mode fronts this process behind
   a proxy the caller key collapses to the proxy's address, which is exactly
   where the LAN PIN gate (above) is the real defence. */
const authLimiter = createLimiter({ windowMs: 60_000, max: 15 });
const aiLimiter = createLimiter({ windowMs: 60_000, max: 20 });

function callerKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "local";
}

function rateLimited(c: Context, retryAfterSec: number): Response {
  c.header("Retry-After", String(retryAfterSec));
  return c.json(
    { error: "rate_limited", message: "Too many requests — wait a moment and try again." },
    429,
  );
}

app.use("/api/auth/*", async (c, next) => {
  if (c.req.method !== "POST") return next();
  const decision = authLimiter.check(callerKey(c.req.raw.headers));
  if (!decision.allowed) return rateLimited(c, decision.retryAfterSec);
  await next();
});

app.use("/api/ai/*", async (c, next) => {
  if (c.req.method !== "POST") return next();
  const decision = aiLimiter.check(callerKey(c.req.raw.headers));
  if (!decision.allowed) return rateLimited(c, decision.retryAfterSec);
  await next();
});

/* --- session: who am I? ------------------------------------------------- */
app.get("/api/me", async (c) => {
  const session = await getSession(c.req.raw.headers, auth);
  if (!session) return c.json({ user: null, profile: null }, 200);

  // Backstop for accounts created before the sign-up hook existed.
  await ensureProfile(db.orm, session.user.id, session.user.name);

  const [profile] = await db.orm
    .select()
    .from(users)
    .where(eq(users.authUserId, session.user.id))
    .limit(1);

  return c.json(
    {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image ?? null,
        emailVerified: session.user.emailVerified,
      },
      profile: profile
        ? {
            displayName: profile.displayName,
            timezone: profile.timezone,
            needsOnboarding: !(profile.settings as { onboardedAt?: string }).onboardedAt,
          }
        : null,
      session: { expiresAt: session.session.expiresAt },
    },
    200,
  );
});

/* --- subjects and topics (P4) ------------------------------------------- */
app.route("/api/subjects", subjectsRouter);

/* --- notes and attachments (P5) ------------------------------------------ */
app.route("/api/notes", notesRouter);

/* --- AI actions (P5 action bar) ------------------------------------------ */
app.route("/api/ai", aiRouter);

/* --- quizzes: generate, take, grade, retry (P8) --------------------------- */
app.route("/api/quizzes", quizzesRouter);

/* --- flashcards: generate, edit, study, schedule (P9) --------------------- */
app.route("/api/flashcards", flashcardsRouter);

/* --- tasks and recurring series (P11) ------------------------------------- */
app.route("/api/tasks", tasksRouter);

/* --- the day plan and daily quest (P12) ----------------------------------- */
app.route("/api/plan", planRouter);

/* --- quests: templates, steps, rewards (P13) ------------------------------- */
app.route("/api/quests", questsRouter);

/* --- study sessions: timer, guided run, log (P14) -------------------------- */
app.route("/api/sessions", sessionsRouter);

/* --- XP, levels, streaks, achievements (P15) ------------------------------ */
app.route("/api/gamification", gamificationRouter);

/* --- progress: study time, quiz history, counts (P16) --------------------- */
app.route("/api/progress", progressRouter);

/* --- recommendations: what's next (P17) ----------------------------------- */
app.route("/api/recommendations", recommendationsRouter);

/* --- reminders: bell, centre, settings (P18) ------------------------------- */
app.route("/api/reminders", remindersRouter);

/* --- search: the palette and the results page (P19) ----------------------- */
app.route("/api/search", searchRouter);

/* --- LAN access and the app PIN (P20) ------------------------------------- */
app.route("/api/lan", lanRouter);

/* --- diagnostics: the tail of the log, for Copy diagnostics (P21) --------- */
app.route("/api/diagnostics", diagnosticsRouter);

/* --- export / import / backup (P21), before the files catch-all ---------- */
app.route("/api", dataRouter);

/* --- local file serving (ADR-027 fallback) ------------------------------- */
app.get("/api/files/*", async (c) => {
  const key = c.req.path.replace("/api/files/", "");
  try {
    const url = await fileStore.getUrl(key);
    if (url.startsWith("http")) {
      return c.redirect(url);
    }
    // __dirname, dirname, join, createReadStream are imported at the top of the file
    const DATA_ROOT = join(__dirname, "..", "..", "..", "data", "files");
    const fullPath = join(DATA_ROOT, key);
    const fileStream = createReadStream(fullPath);
    return new Response(fileStream as unknown as ReadableStream, {
      headers: { "Content-Type": "application/octet-stream" },
    });
  } catch {
    return c.json({ error: "not_found" }, 404);
  }
});

app.route("/api/onboarding", onboarding);

/* --- health ------------------------------------------------------------- */
app.get("/api/health", (c) =>
  c.json(
    {
      ok: true,
      service: "study-quest-api",
      version: "0.1.0",
      database: { driver: db.driver, reachable: true },
      auth: { provider: "better-auth", ready: true },
      ai: {
        provider: process.env.AI_DEFAULT_PROVIDER ?? "groq",
        // Delegated to the settings module, which owns the list of environment variables —
        // the health route used to keep its own copy and drift away from it.
        configured: anyEnvConfigured(),
      },
      storage: {
        provider: process.env.R2_ACCOUNT_ID ? "r2" : "local",
        configured: Boolean(process.env.R2_ACCOUNT_ID),
      },
    },
    200,
  ),
);

/* --- the built web app, from the same process as the API (P22) ------------
   Registered last, so every /api route above keeps answering for itself and
   anything unmatched that looks like a page gets the SPA shell instead of a
   JSON 404. See web.ts for the two rules and the cache policy. */
const WEB_DIST = join(__dirname, "..", "..", "web", "dist");
app.on(["GET", "HEAD"], "*", (c) => {
  if (process.env.NETLIFY === "true") return c.notFound(); // Netlify serves the assets

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

app.notFound((c) => c.json({ error: "not_found", path: c.req.path }, 404));

app.onError((err, c) => {
  // An AiError already knows what it is: not_configured is a 403 the UI answers with
  // setup, cap_reached a 402 the UI answers with tomorrow. aiErrorStatus has always
  // been the defined mapping for this — it just was not wired into the path.
  if (err instanceof AiError)
    return c.json({ error: err.code, message: err.message }, aiErrorStatus(err.code));
  // To the console AND to data/logs/server.log — a crash nobody was watching
  // still has a trace the Copy diagnostics action can hand over (P21).
  logError("api", err);
  return c.json({ error: "internal_error", message: err.message }, 500);
});

export { app };

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

if (process.env.NETLIFY !== "true") {
  const server = serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
    console.log(`Study Quest API listening on http://${HOST}:${info.port}`);
    console.log(`  health: http://${HOST}:${info.port}/api/health`);
    console.log(`  sign in: http://localhost:5173`);
    // The tick lives inside the local serve only — Netlify has no long-running
    // process, and ADR-017 keeps the scheduler in-process wherever there is one.
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
}

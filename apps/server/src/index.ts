/**
 * Study Quest API server.
 *
 * Runs locally on 127.0.0.1:4321. The database is PostgreSQL (Docker, ADR-028) when
 * DATABASE_URL is set, otherwise PGlite in-process — so the app runs before Docker is
 * configured.
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createReadStream } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", "..", "..", ".env") });

import { serve } from "@hono/node-server";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import * as dbSchema from "@sq/db/schema";

import { createAuth, ensureProfile } from "./auth.ts";
import type { AuthedEnv } from "./auth/session.ts";
import { getSession } from "./auth/session.ts";
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
import { fileStore } from "./files/store.ts";

const { users } = dbSchema;

const PORT = Number(process.env.PORT ?? 4321);
const HOST = process.env.HOST ?? "127.0.0.1";
const BASE_URL = process.env.BASE_URL ?? process.env.BETTER_AUTH_URL ?? `http://${HOST}:${PORT}`;

console.log(`[db] driver: ${db.driver}`);

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

/* --- auth: Better Auth owns every route under /api/auth/* -------------- */
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

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

app.notFound((c) => c.json({ error: "not_found", path: c.req.path }, 404));

app.onError((err, c) => {
  // An AiError already knows what it is: not_configured is a 403 the UI answers with
  // setup, cap_reached a 402 the UI answers with tomorrow. aiErrorStatus has always
  // been the defined mapping for this — it just was not wired into the path.
  if (err instanceof AiError)
    return c.json({ error: err.code, message: err.message }, aiErrorStatus(err.code));
  console.error("[api]", err);
  return c.json({ error: "internal_error", message: err.message }, 500);
});

export { app };

if (process.env.NETLIFY !== "true") {
  serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
    console.log(`Study Quest API listening on http://${HOST}:${info.port}`);
    console.log(`  health: http://${HOST}:${info.port}/api/health`);
    console.log(`  sign in: http://localhost:5173`);
  });
}

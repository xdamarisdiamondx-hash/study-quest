/**
 * Study Quest API server.
 *
 * Runs locally on 127.0.0.1:4321. The database is PostgreSQL (Docker, ADR-028) when
 * DATABASE_URL is set, otherwise PGlite in-process — so the app runs before Docker is
 * configured.
 */
import { serve } from "@hono/node-server";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { createDb } from "@sq/db/client";
import * as dbSchema from "@sq/db/schema";
import { createAuth } from "./auth.ts";

const { users, subjects } = dbSchema;

const PORT = Number(process.env.PORT ?? 4321);
const HOST = process.env.HOST ?? "127.0.0.1";
const BASE_URL = process.env.BASE_URL ?? process.env.BETTER_AUTH_URL ?? `http://${HOST}:${PORT}`;

const db = await createDb();
console.log(`[db] driver: ${db.driver}`);

const auth = createAuth({
  orm: db.orm,
  baseURL: BASE_URL,
  isProduction: process.env.NODE_ENV === "production",
});

const app = new Hono();

/* --- auth: Better Auth owns every route under /api/auth/* -------------- */
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

/** Ensure an app-level profile row exists for an authenticated user (P3). */
async function ensureProfile(userId: string, name: string) {
  await db.orm
    .insert(users)
    .values({ authUserId: userId, displayName: name })
    .onConflictDoNothing({ target: users.authUserId });
}

/* --- session: who am I? ------------------------------------------------- */
app.get("/api/me", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ user: null, profile: null }, 200);

  await ensureProfile(session.user.id, session.user.name);
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
        ? { displayName: profile.displayName, timezone: profile.timezone }
        : null,
      session: { expiresAt: session.session.expiresAt },
    },
    200,
  );
});

/* --- subjects: authenticated only ---------------------------------------- */
app.get("/api/subjects", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const rows = await db.orm.select().from(subjects).orderBy(subjects.orderIndex).limit(50);
  return c.json({ subjects: rows }, 200);
});

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
        provider: process.env.AI_DEFAULT_PROVIDER ?? null,
        configured: Boolean(process.env.OLLAMA_BASE_URL || process.env.GEMINI_API_KEY),
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
  console.error("[api]", err);
  return c.json({ error: "internal_error", message: err.message }, 500);
});

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
  console.log(`Study Quest API listening on http://${HOST}:${info.port}`);
  console.log(`  health: http://${HOST}:${info.port}/api/health`);
  console.log(`  sign in: http://localhost:5173`);
});

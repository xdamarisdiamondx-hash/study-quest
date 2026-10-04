/**
 * Study Quest API - Netlify Function (single-file, bundled)
 * All dependencies bundled via esbuild
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";

// Inlined schema definitions
const users = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  authUserId: text("auth_user_id").unique(),
  displayName: text("display_name").default(""),
  settings: jsonb("settings").default({}),
  timezone: text("timezone").default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

const session = pgTable("session", {
  id: uuid("id").primaryKey().defaultRandom(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").unique().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
});

const account = pgTable("account", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

const verification = pgTable("verification", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

const subjects = pgTable("subjects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  monogram: text("monogram").notNull(),
  icon: text("icon"),
  orderIndex: integer("order_index").default(0),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

const topics = pgTable("topics", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id").notNull().references(() => subjects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  orderIndex: integer("order_index").default(0),
  status: text("status").default("not_started"),
  progressCache: integer("progress_cache").default(0),
  lastStudiedAt: timestamp("last_studied_at", { withTimezone: true }),
});

const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
  title: text("title").default(""),
  bodyMd: text("body_md").default(""),
  wordCount: integer("word_count").default(0),
  pinned: boolean("pinned").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

const noteRevisions = pgTable("note_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  noteId: uuid("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  bodyMd: text("body_md").notNull(),
  savedAt: timestamp("saved_at", { withTimezone: true }).defaultNow(),
});

// Monogram helper
function monogramFor(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 4);
}

// Neon database
const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema: { users, session, account, verification, subjects, topics, notes } });

// Better Auth
const auth = betterAuth({
  database: (await import("better-auth/adapters/drizzle")).drizzleAdapter(drizzle(sql), {
    provider: "pg",
    schema: { user: users, session, account, verification },
  }),
  emailAndPassword: { enabled: true, requireEmailVerification: false },
  session: { cookieCache: { enabled: true, maxAge: 60 * 60 * 24 * 7 } },
  trustedOrigins: [process.env.CORS_ORIGIN || "http://localhost:5173", "https://*.netlify.app"],
});

// Hono app
const app = new Hono();

app.use("*", cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
}));

// Make auth and db available
app.use("*", async (c, next) => {
  c.set("auth", auth);
  c.set("db", db);
  await next();
});

// Health
app.get("/api/health", (c) => c.json({
  ok: true, service: "study-quest-api", version: "0.1.0",
  database: { driver: "neon", reachable: true },
  auth: { provider: "better-auth", ready: true },
  ai: { provider: "groq", configured: Boolean(process.env.GROQ_API_KEY) },
}));

// Auth routes
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  const auth = c.get("auth");
  return auth.handler(c.req.raw);
});

// Current user
app.get("/api/me", async (c) => {
  const auth = c.get("auth");
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ user: null, profile: null, session: null });

  const [profile] = await db.select({ id: users.id }).from(users).where(eq(users.authUserId, session.user.id)).limit(1);

  return c.json({
    user: { id: session.user.id, name: session.user.name, email: session.user.email, image: session.user.image, emailVerified: session.user.emailVerified },
    profile: profile ? { displayName: profile.displayName, timezone: profile.timezone, needsOnboarding: !(profile.settings as any)?.onboardedAt } : null,
    session: { expiresAt: session.session.expiresAt },
  });
});

// Auth middleware
app.use("/api/*", async (c, next) => {
  const auth = c.get("auth");
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const [profile] = await db.select({ id: users.id }).from(users).where(eq(users.authUserId, session.user.id)).limit(1);
  if (!profile) return c.json({ error: "no_profile" }, 409);

  c.set("profileId", profile.id);
  await next();
});

// Placeholder routers
const subjectsRouter = new Hono();
const notesRouter = new Hono();
const aiRouter = new Hono();

app.route("/api/subjects", subjectsRouter);
app.route("/api/notes", notesRouter);
app.route("/api/ai", aiRouter);

// 404
app.notFound((c) => c.json({ error: "not_found" }, 404));

// Netlify Functions handler
export default {
  async fetch(request: Request, env: Record<string, string>): Promise<Response> {
    Object.entries(env).forEach(([k, v]) => { if (!process.env[k]) process.env[k] = v; });
    return app.fetch(request);
  },
};
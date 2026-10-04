/**
 * Study Quest API - Netlify Function (directory-based)
 * Self-contained Netlify Function with Neon + Better Auth
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";

// Neon database
const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

// Better Auth with Drizzle adapter
const auth = betterAuth({
  database: (await import("better-auth/adapters/drizzle")).drizzleAdapter(drizzle(sql), {
    provider: "pg",
    schema: {
      user: { tableName: "user", fields: { id: "id", name: "name", email: "email", emailVerified: "emailVerified", image: "image", createdAt: "createdAt", updatedAt: "updatedAt" } },
      session: { tableName: "session", fields: { id: "id", expiresAt: "expiresAt", token: "token", createdAt: "createdAt", updatedAt: "updatedAt", ipAddress: "ipAddress", userAgent: "userAgent", userId: "userId" } },
      account: { tableName: "account", fields: { id: "id", accountId: "accountId", providerId: "providerId", userId: "userId", accessToken: "accessToken", refreshToken: "refreshToken", idToken: "idToken", accessTokenExpiresAt: "accessTokenExpiresAt", refreshTokenExpiresAt: "refreshTokenExpiresAt", scope: "scope", password: "password", createdAt: "createdAt", updatedAt: "updatedAt" } },
      verification: { tableName: "verification", fields: { id: "id", identifier: "identifier", value: "value", expiresAt: "expiresAt", createdAt: "createdAt", updatedAt: "updatedAt" } },
    },
  }),
  emailAndPassword: { enabled: true, requireEmailVerification: false },
  session: { cookieCache: { enabled: true, maxAge: 60 * 60 * 24 * 7 } },
  trustedOrigins: [process.env.CORS_ORIGIN || "http://localhost:5173", "https://*.netlify.app"],
});

// Hono app
const app = new Hono();

// CORS
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

  return c.json({
    user: { id: session.user.id, name: session.user.name, email: session.user.email, image: session.user.image, emailVerified: session.user.emailVerified },
    profile: null,
    session: { expiresAt: session.session.expiresAt },
  });
});

// Auth middleware
app.use("/api/*", async (c, next) => {
  const auth = c.get("auth");
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const db = c.get("db");
  const users = (await import("@sq/db/schema")).users;
  const { eq } = await import("drizzle-orm");
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
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use("*", cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
}));

app.get("/health", (c) => c.json({
  ok: true,
  message: "API works!",
  timestamp: new Date().toISOString(),
}));

app.get("/test", (c) => c.json({
  ok: true,
  message: "Test endpoint works!",
  timestamp: new Date().toISOString(),
}));

export default {
  async fetch(request, env) {
    Object.entries(env).forEach(([k, v]) => { if (!process.env[k]) process.env[k] = v; });
    return app.fetch(request);
  },
};
/**
 * Minimal test function to verify Netlify Functions deployment works
 */

import { Hono } from "hono";

const app = new Hono();

app.get("/api/health", (c) => c.json({
  ok: true,
  message: "Minimal function works!",
  timestamp: new Date().toISOString(),
}));

export default {
  async fetch(request: Request, env: Record<string, string>): Promise<Response> {
    Object.entries(env).forEach(([k, v]) => { if (!process.env[k]) process.env[k] = v; });
    return app.fetch(request);
  },
};
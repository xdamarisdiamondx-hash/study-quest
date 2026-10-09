/**
 * The serverless scheduler entry point (Vercel Cron).
 *
 * A long-lived process owns a timer (scheduler.ts); a function host cannot,
 * so the platform calls this route once an hour and the same reminder sync
 * runs inside the invocation. The guard is the Vercel Cron contract: the
 * platform sends `Authorization: Bearer $CRON_SECRET`, and a stranger who
 * guesses the URL sends nothing worth trusting (see serverless.ts).
 */
import { Hono } from "hono";

import { cronAuthorized } from "../serverless.ts";
import { syncReminders } from "../scheduler.ts";

export const cronRouter = new Hono();

cronRouter.get("/tick", async (c) => {
  if (!cronAuthorized(c.req.header("authorization"), process.env.CRON_SECRET)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const result = await syncReminders();
  return c.json({ ok: true, ...result, at: new Date().toISOString() });
});

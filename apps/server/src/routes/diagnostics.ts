/**
 * What the "Copy diagnostics" action needs from the server (P21).
 *
 * Session-gated like every data route, and shaped so it can be pasted
 * anywhere: version, uptime, which database driver is live, whether the LAN
 * gate and AI are configured (booleans only — no keys, no PIN material), and
 * the tail of the local log file. The LAN gate applies before this route
 * (index.ts exempts only health/lan/me), so on a locked network it answers
 * 423 like any other data route.
 */
import { Hono } from "hono";

import { anyEnvConfigured } from "../ai/settings.ts";
import { requireProfile, type ProfileEnv } from "../auth/currentProfile.ts";
import { db } from "../db.ts";
import { lanEnabled } from "../lan.ts";
import { logFileHint, recentLines } from "../log.ts";

/** Process start ≈ module load; cheaper than threading a clock through. */
const STARTED_AT = new Date().toISOString();

export const diagnosticsRouter = new Hono<ProfileEnv>();

diagnosticsRouter.get("/", async (c) => {
  const denied = await requireProfile(c);
  if (denied) return denied;

  return c.json({
    app: {
      version: "0.1.0",
      startedAt: STARTED_AT,
      uptimeSec: Math.round(process.uptime()),
      node: process.version,
      driver: db.driver,
    },
    lan: { enabled: lanEnabled() },
    ai: { configured: anyEnvConfigured() },
    storage: { provider: process.env.R2_ACCOUNT_ID ? "r2" : "local" },
    log: { ...logFileHint(), lines: recentLines(40) },
  });
});

/**
 * LAN access and the app PIN (P20, ADR-023).
 *
 * `status` and `unlock` sit outside the PIN gate (index.ts exempts them): the
 * app needs status to decide whether to show the gate, and unlock is the gate.
 * Neither reveals study data — status exposes at most the machine's LAN
 * address, and unlock answers yes or no to a 4-digit guess (with a pause after
 * five misses). `toggle` and `pin` require a signed-in session: the network
 * and the PIN are switched from inside an already-authenticated app.
 */
import { Hono } from "hono";
import { networkInterfaces } from "node:os";

import { requireProfile, type ProfileEnv } from "../auth/currentProfile.ts";
import {
  attemptsLocked,
  clearFailures,
  disableLan,
  enableLan,
  isUnlocked,
  lanEnabled,
  rebind,
  registerFailure,
  rotatePin,
  unlockCookie,
  verifyPin,
} from "../lan.ts";

export const lanRouter = new Hono<ProfileEnv>();

/** The address a phone on this network would reach us at, for the instructions. */
function lanIp(): string | null {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return null;
}

lanRouter.get("/status", (c) => {
  const enabled = lanEnabled();
  return c.json({
    enabled,
    unlocked: !enabled || isUnlocked(c.req.header("cookie")),
    lanIp: enabled ? lanIp() : null,
  });
});

lanRouter.post("/unlock", async (c) => {
  if (attemptsLocked()) return c.json({ error: "too_many_attempts" }, 429);

  const body = await c.req.json<{ pin?: unknown }>().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin : "";

  if (!verifyPin(pin)) {
    registerFailure();
    // A flat pause, not an escalating backoff: enough to make online guessing
    // pointless, small enough that a typo does not feel like a lockout.
    await new Promise((resolve) => setTimeout(resolve, 250));
    return c.json({ error: "bad_pin" }, 401);
  }

  clearFailures();
  c.header("Set-Cookie", unlockCookie());
  return c.json({ ok: true });
});

lanRouter.post("/toggle", async (c) => {
  const denied = await requireProfile(c);
  if (denied) return denied;

  const body = await c.req.json<{ enabled?: unknown }>().catch(() => null);
  if (typeof body?.enabled !== "boolean") {
    return c.json({ error: "invalid", issues: ["enabled must be true or false."] }, 400);
  }

  const enabled = body.enabled;
  let minted: string | null = null;
  if (enabled) minted = enableLan();
  else disableLan();

  // The session that flipped the switch stays unlocked — it just proved who it
  // is. Every other browser starts locked, because the token rotated.
  c.header("Set-Cookie", unlockCookie());

  // Rebind after the response has flushed: closing the listener inside the
  // handler would kill the connection carrying this very answer. Same port,
  // same process — a failed rebind only means the config takes effect at the
  // next start, which the card's copy covers.
  setTimeout(() => {
    void rebind(enabled).catch((err: unknown) => {
      console.error("[lan] rebind failed; the new bind applies on restart:", err);
    });
  }, 300);

  return c.json({
    status: {
      enabled,
      unlocked: true,
      lanIp: enabled ? lanIp() : null,
    },
    pin: minted,
  });
});

lanRouter.post("/pin", async (c) => {
  const denied = await requireProfile(c);
  if (denied) return denied;
  return c.json({ pin: rotatePin() });
});

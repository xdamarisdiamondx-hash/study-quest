/**
 * Reminders (P18): GET serves the bell's centre (delivered rows + unread
 * count); the settings pair reads and writes the per-type switches and quiet
 * hours and answers with the next-fire forecast the page shows under them —
 * the forecast runs on the same gather as the tick, so it cannot disagree
 * with what will actually be delivered. Mutations are one-row writes scoped to
 * the caller; the read/snooze replies are idempotent so a double click is a
 * no-op.
 */
import { Hono } from "hono";

import { REMINDER_LABELS, REMINDER_TYPES, type ReminderType } from "@sq/core/reminders";

import { requireProfile, type ProfileEnv } from "../auth/currentProfile.ts";
import {
  firePreview,
  loadSettings,
  markAllRead,
  markRead,
  remindersCentre,
  snooze,
  updateSettings,
} from "../services/reminders.ts";

export const remindersRouter = new Hono<ProfileEnv>();

remindersRouter.use("*", async (c, next) => {
  const denied = await requireProfile(c);
  if (denied) return denied;
  await next();
});

/** "HH:MM" the way the engine parses it — reject before it reaches the row. */
function validTime(value: string): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return false;
  return Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

async function settingsPayload(profileId: string) {
  const [settings, next] = await Promise.all([loadSettings(profileId), firePreview(profileId)]);
  return {
    settings,
    types: REMINDER_TYPES.map((type) => ({ type, label: REMINDER_LABELS[type] })),
    nextFires: next,
  };
}

remindersRouter.get("/", async (c) => c.json(await remindersCentre(c.var.profileId)));

remindersRouter.get("/settings", async (c) => c.json(await settingsPayload(c.var.profileId)));

remindersRouter.put("/settings", async (c) => {
  const body = await c.req
    .json<{ enabled?: unknown; quietStart?: unknown; quietEnd?: unknown }>()
    .catch(() => null);
  if (!body) {
    return Response.json(
      { error: "invalid", issues: ["Body must be a JSON object."] },
      { status: 400 },
    );
  }

  const issues: string[] = [];
  const patch: {
    enabled?: Partial<Record<ReminderType, boolean>>;
    quietStart?: string;
    quietEnd?: string;
  } = {};

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "object" || body.enabled === null || Array.isArray(body.enabled)) {
      issues.push("enabled must be an object of type flags.");
    } else {
      const enabled: Partial<Record<ReminderType, boolean>> = {};
      for (const [key, value] of Object.entries(body.enabled as Record<string, unknown>)) {
        if (!(REMINDER_TYPES as readonly string[]).includes(key)) {
          issues.push(`Unknown reminder type "${key}".`);
          continue;
        }
        if (typeof value !== "boolean") {
          issues.push(`Flag "${key}" must be true or false.`);
          continue;
        }
        enabled[key as ReminderType] = value;
      }
      patch.enabled = enabled;
    }
  }
  for (const key of ["quietStart", "quietEnd"] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || !validTime(value)) {
      issues.push(`${key} must be a time like "22:00".`);
      continue;
    }
    patch[key] = value.trim();
  }
  if (issues.length > 0) {
    return Response.json({ error: "invalid", issues }, { status: 400 });
  }

  await updateSettings(c.var.profileId, patch);
  return c.json(await settingsPayload(c.var.profileId));
});

remindersRouter.post("/read-all", async (c) => {
  const updated = await markAllRead(c.var.profileId);
  return c.json({ ok: true, updated });
});

remindersRouter.post("/:id/read", async (c) => {
  const ok = await markRead(c.var.profileId, c.req.param("id"));
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

remindersRouter.post("/:id/snooze", async (c) => {
  const fireAt = await snooze(c.var.profileId, c.req.param("id"));
  if (!fireAt) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true, fireAt });
});

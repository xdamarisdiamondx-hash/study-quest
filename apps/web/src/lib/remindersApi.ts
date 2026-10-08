/**
 * Typed client for the reminders API (P18): the bell reads the centre, the
 * settings card reads and writes switches and quiet hours, and every mutation
 * is one idempotent row write. Types come from the same core module the server
 * schedules with, so a label the client renders is the type the engine fires.
 */
import type { ReminderSettings, ReminderType } from "@sq/core/reminders";

import { ApiError } from "./subjectsApi";

export interface ReminderRow {
  id: string;
  type: ReminderType;
  title: string;
  body: string;
  href: string;
  fireAt: string;
  deliveredAt: string;
  readAt: string | null;
}

export interface RemindersCentre {
  reminders: ReminderRow[];
  unread: number;
}

export interface NextFire {
  type: ReminderType;
  fireAt: string;
}

export interface ReminderSettingsView {
  settings: ReminderSettings;
  types: Array<{ type: ReminderType; label: string }>;
  nextFires: NextFire[];
}

export interface SettingsPatch {
  enabled?: Partial<Record<ReminderType, boolean>>;
  quietStart?: string;
  quietEnd?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { issues?: string[] } | null;
    throw new ApiError(
      detail?.issues?.[0] ?? "That reminder change could not be saved",
      res.status,
    );
  }
  return res.json() as Promise<T>;
}

export const remindersApi = {
  centre: () => request<RemindersCentre>("/api/reminders"),
  settings: () => request<ReminderSettingsView>("/api/reminders/settings"),
  updateSettings: (patch: SettingsPatch) =>
    request<ReminderSettingsView>("/api/reminders/settings", {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  markRead: (id: string) => request<{ ok: true }>(`/api/reminders/${id}/read`, { method: "POST" }),
  markAllRead: () =>
    request<{ ok: true; updated: number }>("/api/reminders/read-all", { method: "POST" }),
  snooze: (id: string) =>
    request<{ ok: true; fireAt: string }>(`/api/reminders/${id}/snooze`, {
      method: "POST",
    }),
};

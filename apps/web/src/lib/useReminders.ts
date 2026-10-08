/**
 * Reminder state (P18): the bell's centre polls every 30 seconds — a nudge is
 * only worth knowing about while the tab is open, and the server tick is the
 * one that decides *when* (this file never schedules anything). Settings are
 * a plain query invalidated by its own writes, so the next-fire forecast under
 * the switches always reflects the row just saved.
 *
 * The browser Notification is fired from an effect, once per delivered row,
 * with the delivery timestamp as the marker in localStorage: a reload or a
 * re-render never re-announces the same row, and a first-ever grant seeds the
 * marker instead of erupting with the whole history. Permission is only asked
 * from a click (the settings button) — never on load.
 */
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { remindersApi, type RemindersCentre, type SettingsPatch } from "./remindersApi";

export type { RemindersCentre, ReminderRow, ReminderSettingsView } from "./remindersApi";

export const reminderKeys = {
  all: ["reminders"] as const,
  centre: ["reminders", "centre"] as const,
  settings: ["reminders", "settings"] as const,
};

const CENTRE_POLL_MS = 30_000;
const LAST_NOTIFIED_KEY = "sq:lastNotifiedAt";

export function useRemindersCentre() {
  return useQuery({
    queryKey: reminderKeys.centre,
    queryFn: () => remindersApi.centre(),
    refetchInterval: CENTRE_POLL_MS,
    refetchOnWindowFocus: true,
  });
}

export function useReminderSettings() {
  return useQuery({
    queryKey: reminderKeys.settings,
    queryFn: () => remindersApi.settings(),
  });
}

export function useMarkReminderRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => remindersApi.markRead(id),
    // Optimistic: the dot goes out on click, the row stays (it is history now).
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: reminderKeys.centre });
      const previous = client.getQueryData<RemindersCentre>(reminderKeys.centre);
      if (previous) {
        client.setQueryData<RemindersCentre>(reminderKeys.centre, {
          ...previous,
          unread: Math.max(0, previous.unread - 1),
          reminders: previous.reminders.map((r) =>
            r.id === id && !r.readAt ? { ...r, readAt: new Date().toISOString() } : r,
          ),
        });
      }
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) client.setQueryData(reminderKeys.centre, ctx.previous);
    },
    onSettled: () => void client.invalidateQueries({ queryKey: reminderKeys.centre }),
  });
}

export function useMarkAllRemindersRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => remindersApi.markAllRead(),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: reminderKeys.centre });
      const previous = client.getQueryData<RemindersCentre>(reminderKeys.centre);
      if (previous) {
        const now = new Date().toISOString();
        client.setQueryData<RemindersCentre>(reminderKeys.centre, {
          ...previous,
          unread: 0,
          reminders: previous.reminders.map((r) => (r.readAt ? r : { ...r, readAt: now })),
        });
      }
      return { previous };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.previous) client.setQueryData(reminderKeys.centre, ctx.previous);
    },
    onSettled: () => void client.invalidateQueries({ queryKey: reminderKeys.centre }),
  });
}

export function useSnoozeReminder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => remindersApi.snooze(id),
    // Optimistic: a snoozed row leaves the centre until the tick redelivers it.
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: reminderKeys.centre });
      const previous = client.getQueryData<RemindersCentre>(reminderKeys.centre);
      if (previous) {
        const gone = previous.reminders.find((r) => r.id === id);
        client.setQueryData<RemindersCentre>(reminderKeys.centre, {
          ...previous,
          unread: gone && !gone.readAt ? Math.max(0, previous.unread - 1) : previous.unread,
          reminders: previous.reminders.filter((r) => r.id !== id),
        });
      }
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) client.setQueryData(reminderKeys.centre, ctx.previous);
    },
    onSettled: () => void client.invalidateQueries({ queryKey: reminderKeys.centre }),
  });
}

export function useUpdateReminderSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => remindersApi.updateSettings(patch),
    onSuccess: (data) => {
      // The server may have dropped rows of a type just switched off.
      client.setQueryData(reminderKeys.settings, data);
      void client.invalidateQueries({ queryKey: reminderKeys.centre });
    },
  });
}

/**
 * Announce rows delivered since the last marker. Called by the bell (mounted
 * for every page); does nothing until permission was granted by a click.
 */
export function useDesktopNotifications(centre: RemindersCentre | undefined): void {
  useEffect(() => {
    if (!centre || centre.reminders.length === 0) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const raw = localStorage.getItem(LAST_NOTIFIED_KEY);
    if (raw === null) {
      // First grant: remember "now" so the backlog of history stays silent.
      localStorage.setItem(LAST_NOTIFIED_KEY, new Date().toISOString());
      return;
    }
    const last = Date.parse(raw);
    if (Number.isNaN(last)) return;

    let newest = last;
    for (const row of centre.reminders) {
      const at = Date.parse(row.deliveredAt);
      if (Number.isNaN(at)) continue;
      if (at > newest) newest = at;
      if (at <= last) continue;
      // `tag` lets the browser replace a duplicate instead of stacking it.
      new Notification(row.title, { body: row.body, tag: row.id });
    }
    if (newest > last) localStorage.setItem(LAST_NOTIFIED_KEY, new Date(newest).toISOString());
  }, [centre]);
}

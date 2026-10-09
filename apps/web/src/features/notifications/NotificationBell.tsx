/**
 * Notification bell (P18): the header's read surface for delivered reminders.
 * Polling lives in the hook (30s); this file only opens, reads and snoozes.
 * The panel follows the account menu's open/outside-click pattern so the two
 * popovers behave identically. Rows are history — opening one marks it read
 * and goes where the nudge pointed; snooze moves the row back out of the
 * centre for thirty minutes, to be redelivered by the server's tick.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatMonthDay, formatTime } from "../../lib/i18n";

import {
  useDesktopNotifications,
  useMarkAllRemindersRead,
  useMarkReminderRead,
  useRemindersCentre,
  useSnoozeReminder,
} from "../../lib/useReminders";

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const time = formatTime(d);
  return sameDay
    ? time
    : formatMonthDay(d) + `, ${time}`;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const centre = useRemindersCentre().data;
  const markRead = useMarkReminderRead();
  const markAll = useMarkAllRemindersRead();
  const snooze = useSnoozeReminder();
  useDesktopNotifications(centre);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const unread = centre?.unread ?? 0;
  const rows = centre?.reminders ?? [];

  const openRow = (id: string, href: string) => {
    setOpen(false);
    markRead.mutate(id);
    navigate(href);
  };

  return (
    <div className="sq-bell" ref={ref}>
      <button
        type="button"
        className="sq-btn sq-btn-secondary sq-btn-sm sq-bell-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 ? <span className="sq-bell-badge">{unread > 9 ? "9+" : unread}</span> : null}
      </button>

      {open ? (
        <div className="sq-bell-panel" role="dialog" aria-label="Notifications">
          <div className="sq-bell-head">
            <b>Notifications</b>
            {unread > 0 ? (
              <button
                type="button"
                className="sq-btn sq-btn-secondary sq-btn-sm"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
              >
                Mark all read
              </button>
            ) : null}
          </div>

          {rows.length === 0 ? (
            <p className="sq-bell-empty">
              Nothing yet. Deadline and session nudges land here — switch them on or off in
              Settings.
            </p>
          ) : (
            <ul className="sq-bell-list">
              {rows.map((row) => (
                <li key={row.id} className="sq-bell-row">
                  <button
                    type="button"
                    className="sq-bell-item"
                    data-unread={row.readAt === null}
                    onClick={() => openRow(row.id, row.href)}
                  >
                    <span className="sq-bell-item-title">{row.title}</span>
                    <span className="sq-bell-item-body">{row.body}</span>
                    <span className="sq-bell-item-time">{when(row.deliveredAt)}</span>
                  </button>
                  <button
                    type="button"
                    className="sq-bell-snooze"
                    title="Snooze 30 minutes"
                    aria-label={`Snooze "${row.title}" for 30 minutes`}
                    onClick={() => snooze.mutate(row.id)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="13" r="8" />
                      <path d="M12 9v4l2.5 2M9 2h6" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

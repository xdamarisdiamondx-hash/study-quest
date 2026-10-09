/**
 * Reminders settings (P18, PRD §28): the student's side of the interrupt
 * contract — one switch per type, quiet hours, and the forecast that proves
 * the switches mean something ("next fire" comes from the same engine the
 * scheduler runs, so the page can only tell the truth).
 *
 * The switches are `role="switch"` buttons because the design system has no
 * switch to borrow and a checkbox would read as a form, not a control panel.
 * Quiet hours are a draft: typing into a time input fires per segment, so the
 * PUT happens on blur or Enter rather than on every keystroke.
 */
import { useState } from "react";
import { Button, Card, Chip, Input } from "@sq/ui";
import { formatMonthDay, formatTime } from "../../lib/i18n";

import { useReminderSettings, useUpdateReminderSettings } from "../../lib/useReminders";

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const time = formatTime(d);
  return sameDay
    ? `today ${time}`
    : `${formatMonthDay(d)}, ${time}`;
};

type Permission = NotificationPermission | "unsupported";

function browserPermission(): Permission {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function Switch({
  on,
  onToggle,
  label,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="sq-switch"
      data-on={on}
      onClick={onToggle}
      disabled={disabled}
    >
      <span className="sq-switch-knob" />
    </button>
  );
}

export function RemindersCard() {
  const { data: view, isLoading, error } = useReminderSettings();
  const update = useUpdateReminderSettings();
  const [draft, setDraft] = useState<{ quietStart: string; quietEnd: string } | null>(null);
  const [permission, setPermission] = useState<Permission>(browserPermission);

  const saveQuiet = () => {
    if (!draft || !view) return;
    if (
      draft.quietStart === view.settings.quietStart &&
      draft.quietEnd === view.settings.quietEnd
    ) {
      setDraft(null);
      return;
    }
    // Clear the draft only when the save lands (event context, not an effect):
    // a failed PUT keeps the student's input on screen next to the error.
    void update
      .mutateAsync({ quietStart: draft.quietStart, quietEnd: draft.quietEnd })
      .then(() => setDraft(null))
      .catch(() => undefined);
  };

  const askPermission = async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  return (
    <Card title="Reminders">
      {isLoading && !view ? (
        <p className="sq-help" style={{ margin: 0 }}>
          Loading reminders…
        </p>
      ) : null}
      {error ? (
        <p className="sq-help" style={{ margin: "0 0 var(--s3)", color: "var(--bad-500)" }}>
          Reminder settings could not be loaded.
        </p>
      ) : null}

      {view ? (
        <>
          <ul className="sq-rem-types">
            {view.types.map(({ type, label }) => {
              const on = view.settings.enabled[type] ?? true;
              return (
                <li key={type} className="sq-rem-row">
                  <Switch
                    on={on}
                    label={label}
                    disabled={update.isPending}
                    onToggle={() => update.mutate({ enabled: { [type]: !on } })}
                  />
                  <span className="sq-rem-label">{label}</span>
                </li>
              );
            })}
          </ul>
          <p className="sq-help">
            Everything is on by default. Deadline nudges speak a day ahead and an hour ahead; the
            daily slots follow your local clock, and nothing fires twice for the same event.
          </p>

          <div
            className="sq-row"
            style={{ gap: "var(--s4)", marginTop: "var(--s4)", flexWrap: "wrap" }}
          >
            <div className="sq-field">
              <label htmlFor="rem-quiet-start">Quiet from</label>
              <Input
                id="rem-quiet-start"
                type="time"
                value={draft?.quietStart ?? view.settings.quietStart}
                disabled={update.isPending}
                onChange={(e) =>
                  setDraft({
                    quietStart: e.target.value,
                    quietEnd: draft?.quietEnd ?? view.settings.quietEnd,
                  })
                }
                onBlur={() => void saveQuiet()}
              />
            </div>
            <div className="sq-field">
              <label htmlFor="rem-quiet-end">Quiet until</label>
              <Input
                id="rem-quiet-end"
                type="time"
                value={draft?.quietEnd ?? view.settings.quietEnd}
                disabled={update.isPending}
                onChange={(e) =>
                  setDraft({
                    quietStart: draft?.quietStart ?? view.settings.quietStart,
                    quietEnd: e.target.value,
                  })
                }
                onBlur={() => void saveQuiet()}
              />
            </div>
          </div>
          <p className="sq-help">
            Inside this window a nudge waits until it ends — the window may wrap midnight.
          </p>

          <div
            className="sq-row"
            style={{ gap: "var(--s3)", marginTop: "var(--s5)", alignItems: "center" }}
          >
            <span className="sq-label">Browser notifications</span>
            {permission === "granted" ? (
              <Chip tone="ok">On — this browser pings you</Chip>
            ) : permission === "denied" ? (
              <Chip tone="warn">Blocked in browser settings</Chip>
            ) : permission === "unsupported" ? (
              <Chip tone="neutral">Not supported here</Chip>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => void askPermission()}>
                Turn on
              </Button>
            )}
          </div>
          <p className="sq-help">
            The bell always works in the tab; the browser ping is extra and only after you allow it.
            The in-app centre keeps thirty days of history either way.
          </p>

          <div style={{ marginTop: "var(--s5)" }}>
            <span className="sq-label">Next up</span>
            {view.nextFires.length === 0 ? (
              <p className="sq-help" style={{ margin: "var(--s2) 0 0" }}>
                Nothing scheduled in the next seven days — slots appear as deadlines and plans do.
              </p>
            ) : (
              <ul className="sq-rem-next">
                {view.nextFires.map((fire) => (
                  <li key={fire.type}>
                    <span>{view.types.find((t) => t.type === fire.type)?.label ?? fire.type}</span>
                    <span className="sq-rem-next-time">{when(fire.fireAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {update.isError ? (
            <p className="sq-help" style={{ margin: "var(--s3) 0 0", color: "var(--bad-500)" }}>
              That change could not be saved.
            </p>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

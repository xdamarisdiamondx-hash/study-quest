import { useState } from "react";
import { Card, Chip, CheckItem } from "@sq/ui";

import { tasks as seed } from "../../data/mock";

const FILTERS = ["All", "Today", "Upcoming", "Done"] as const;

export function TasksPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [done, setDone] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(seed.map((t) => [t.id, t.done])),
  );

  const visible = seed.filter((t) => {
    const isDone = Boolean(done[t.id]);
    if (filter === "Done") return isDone;
    if (filter === "Today") return t.due === "Today";
    if (filter === "Upcoming") return !isDone && t.due !== "Today";
    return true;
  });

  const open = seed.filter((t) => !done[t.id]).length;

  return (
    <div className="sq-col" style={{ marginTop: "var(--s6)" }}>
      <div>
        <h1
          style={{
            font: "var(--t-h1)",
            margin: "0 0 var(--s1)",
            color: "var(--strong)",
            letterSpacing: "-.025em",
          }}
        >
          Tasks
        </h1>
        <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
          {open} open · assignments, deadlines and revision
        </p>
      </div>

      <div className="sq-row">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={filter === f ? "sq-chip sq-chip-accent" : "sq-chip"}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
          >
            {f}
          </button>
        ))}
      </div>

      <Card>
        {visible.length === 0 ? (
          <p style={{ color: "var(--muted)", font: "var(--t-body-sm)" }}>
            Nothing here. Try another filter, or add a task.
          </p>
        ) : (
          visible.map((t) => (
            <CheckItem
              key={t.id}
              done={Boolean(done[t.id])}
              onToggle={() => setDone((d) => ({ ...d, [t.id]: !d[t.id] }))}
            >
              <span style={{ display: "block" }}>{t.title}</span>
              <span
                style={{
                  display: "flex",
                  gap: "var(--s2)",
                  marginTop: 4,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <span style={{ color: "var(--muted)", fontSize: 13 }}>{t.subject}</span>
                <Chip tone={t.priority === "high" ? "bad" : "neutral"}>{t.due}</Chip>
                {t.recurring ? <Chip tone="iris">{t.recurring}</Chip> : null}
              </span>
            </CheckItem>
          ))
        )}
      </Card>

      <p style={{ color: "var(--muted)", font: "var(--t-body-sm)", margin: 0 }}>
        Recurring tasks, priorities and filters become real in P11. This is the P0 shell with
        placeholder data.
      </p>
    </div>
  );
}

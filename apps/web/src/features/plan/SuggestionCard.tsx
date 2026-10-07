/**
 * One suggested candidate (P12, PRD §17): the task, when it's due, and the prep the
 * engine recommends — accept the prep, schedule the task itself, or decline today.
 * Overdue reads in the paper palette too: a neutral chip, never a red one.
 */
import { Button, Chip } from "@sq/ui";

import type { DayCandidate } from "../../lib/planApi";

interface SuggestionCardProps {
  candidate: DayCandidate;
  busy: boolean;
  onAcceptPrep: () => void;
  onSchedule: () => void;
  onDismiss: () => void;
}

export function SuggestionCard({
  candidate,
  busy,
  onAcceptPrep,
  onSchedule,
  onDismiss,
}: SuggestionCardProps) {
  const suggestion = candidate.suggestion;

  return (
    <div
      className="sq-callout"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "var(--s3)",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <span
          className="sq-row"
          style={{ gap: "var(--s2)", flexWrap: "wrap", alignItems: "baseline" }}
        >
          <b style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{candidate.task.title}</b>
          <Chip tone="neutral">{candidate.due}</Chip>
        </span>
        <p style={{ margin: "4px 0 0", font: "var(--t-body-sm)" }}>
          {suggestion ? (
            <>
              {suggestion.headline}{" "}
              <span style={{ color: "var(--muted)" }}>— {suggestion.reason}</span>
            </>
          ) : (
            <span style={{ color: "var(--muted)" }}>
              No prep needed — this task's topic has nothing to study from yet.
            </span>
          )}
        </p>
      </div>
      <span className="sq-row" style={{ gap: "var(--s2)", flexWrap: "wrap" }}>
        {suggestion ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={onAcceptPrep}>
            Add prep
          </Button>
        ) : null}
        <Button size="sm" variant="primary" disabled={busy} onClick={onSchedule}>
          + Task
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onDismiss}>
          Not today
        </Button>
      </span>
    </div>
  );
}

/**
 * PRD §17's suggestion, attached to the task it belongs to: what to do before you
 * start, why that, why now — and one button that puts those blocks on today's plan.
 *
 * The suggestion itself comes from the same pure engine the plan's tray uses, so a
 * task offers the same prep whether you look at it from Tasks or from Plan.
 */
import { Button, Dialog } from "@sq/ui";
import { localDate } from "@sq/core/planning";
import type { Task } from "@sq/core/schemas/tasks";

import { usePlanActions, useTaskSuggestion } from "../../lib/usePlan";

export function PrepDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const date = localDate(new Date());
  const { data, isPending, isError } = useTaskSuggestion(task.id);
  const actions = usePlanActions();

  const suggestion = data?.suggestion ?? null;
  const steps = suggestion?.steps ?? [];

  async function addToToday() {
    try {
      await actions.add.mutateAsync({
        date,
        blocks: steps.map((s) => ({ kind: s.kind, refId: s.refId, plannedMin: s.plannedMin })),
      });
      onClose();
    } catch {
      /* stay open: the error line below says it, the suggestion is still reviewable */
    }
  }

  return (
    <Dialog open onClose={onClose} title="Before you start">
      <p style={{ margin: "0 0 var(--s3)", fontWeight: 600, overflowWrap: "anywhere" }}>
        {task.title}
      </p>

      {isPending ? (
        <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
          Working out what would help…
        </p>
      ) : isError ? (
        <p className="sq-error" role="alert" style={{ margin: 0 }}>
          Could not load the suggestion.
        </p>
      ) : !suggestion ? (
        <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
          No prep needed — this task's topic has no notes, cards or quizzes yet. Add material under
          Study and suggestions will appear here.
        </p>
      ) : (
        <>
          <p style={{ margin: "0 0 var(--s2)", font: "var(--t-body)" }}>{suggestion.headline}</p>
          <p style={{ margin: "0 0 var(--s3)", color: "var(--muted)", font: "var(--t-body-sm)" }}>
            {suggestion.reason}.
          </p>
          <ul
            style={{
              margin: 0,
              paddingLeft: "1.1em",
              color: "var(--strong)",
              font: "var(--t-body-sm)",
            }}
          >
            {steps.map((s) => (
              <li key={`${s.kind}:${s.refId}`} style={{ marginBottom: 4 }}>
                {s.label} <span style={{ color: "var(--muted)" }}>· {s.plannedMin} min</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {actions.add.isError ? (
        <p className="sq-error" role="alert" style={{ margin: "var(--s3) 0 0" }}>
          Could not save to today's plan.
        </p>
      ) : null}

      <div className="sq-row" style={{ gap: "var(--s2)", marginTop: "var(--s4)" }}>
        <Button
          variant="primary"
          disabled={!suggestion || actions.add.isPending}
          title={
            suggestion ? undefined : "Nothing to add — this task's topic has no study material yet"
          }
          onClick={() => void addToToday()}
        >
          Add prep to today
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}

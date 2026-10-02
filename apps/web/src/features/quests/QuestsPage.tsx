import { Card, QuestStepper } from "@sq/ui";

import { activeQuest } from "../../data/mock";

export function QuestsPage() {
  const done = activeQuest.steps.filter((s) => s.state === "done").length;

  return (
    <div className="sq-col" style={{ marginTop: "var(--s6)" }}>
      <div>
        <h1 style={{ font: "var(--t-h1)", margin: "0 0 var(--s1)", color: "var(--strong)", letterSpacing: "-.025em" }}>
          Quests
        </h1>
        <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
          Study goals, not renamed tasks
        </p>
      </div>

      <Card
        title={activeQuest.title}
        action={
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            {done}/{activeQuest.steps.length}
          </span>
        }
      >
        <QuestStepper steps={activeQuest.steps} />
        <button type="button" className="sq-btn sq-btn-primary sq-btn-block" style={{ marginTop: "var(--s4)" }}>
          Continue quest
        </button>
      </Card>

      <Card>
        <p>
          Quest building, the four quest kinds, and rewards land in P13. The stepper here is the
          real component from <code>@sq/ui</code>.
        </p>
      </Card>
    </div>
  );
}

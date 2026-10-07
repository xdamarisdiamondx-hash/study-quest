/**
 * Quests (P13, PRD §20–21): active quests with their steppers, the one
 * suggested special quest, completed history, and the builder.
 *
 * Steps are clickable because the stepper is a *display of work*, not a gate:
 * a pending step opens its real activity (or marks itself done when the
 * activity has no server event), and a done step can be undone with a confirm —
 * the student stays in control (principle 4) while the list above them keeps
 * honest count.
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, Chip, Dialog, EmptyState, QuestStepper } from "@sq/ui";

import { ApiError } from "../../lib/subjectsApi";
import type { Quest, QuestStep } from "../../lib/questsApi";
import { NextUpStrip } from "../../lib/nextUp";
import { useQuestActions, useQuests } from "../../lib/useQuests";
import { QuestBuilderDialog } from "./QuestBuilderDialog";

const KIND_LABEL: Record<string, string> = {
  topic: "Topic",
  subject: "Subject",
  exam: "Exam",
  weekly: "Weekly",
  personal: "Personal",
};

function messageOf(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * Where "Continue" lands: notes for reading steps, the subject's quiz/flashcard
 * tab for practice — `?tab=` is read by SubjectDetailPage (P13). Null means the
 * step has no page (manual steps, count steps, deleted subjects).
 */
function stepLink(step: QuestStep): string | null {
  if (!step.subjectId) return null;
  const base = `/study/${step.subjectId}`;
  switch (step.kind) {
    case "read_notes":
    case "review_summary":
      return step.refType === "topic" && step.refId
        ? `${base}/${step.refId}/notes`
        : `${base}?tab=notes`;
    case "study_flashcards":
      return `${base}?tab=flashcards`;
    case "complete_quiz":
    case "final_challenge":
      return `${base}?tab=quizzes`;
    default:
      return null;
  }
}

const dateOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;

export function QuestsPage() {
  const { data, isPending, error } = useQuests();
  const actions = useQuestActions();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const focusQuest = params.get("quest");

  const [builder, setBuilder] = useState(false);
  const [celebration, setCelebration] = useState<{ title: string; xp: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function fail(err: unknown, fallback: string) {
    setActionError(messageOf(err, fallback));
  }

  function complete(step: QuestStep) {
    setActionError(null);
    actions.completeStep.mutate(step.id, {
      onSuccess: (result) => {
        if (result.questCompleted) {
          setCelebration({ title: result.quest.title, xp: result.questXp });
        }
      },
      onError: (err) => fail(err, "Could not update the step."),
    });
  }

  function selectStep(quest: Quest, step: QuestStep) {
    if (step.status === "done") {
      if (window.confirm(`Mark “${step.title}” as not done?`)) {
        setActionError(null);
        actions.resetStep.mutate(step.id, {
          onError: (err) => fail(err, "Could not undo the step."),
        });
      }
      return;
    }
    const link = stepLink(step);
    if (link) {
      navigate(link);
      return;
    }
    if (step.kind === "manual") complete(step);
    // Count steps complete themselves as the work happens.
  }

  function acceptOffer() {
    if (!data?.offer) return;
    setActionError(null);
    const o = data.offer;
    actions.create.mutate(
      o.template === "topic"
        ? { template: "topic", topicId: o.scopeId }
        : { template: "subject", subjectId: o.scopeId },
      { onError: (err) => fail(err, "Could not start the quest.") },
    );
  }

  function declineOffer() {
    if (!data?.offer) return;
    setActionError(null);
    const o = data.offer;
    actions.decline.mutate(
      { template: o.template, scopeId: o.scopeId, title: o.title },
      { onError: (err) => fail(err, "Could not decline the offer.") },
    );
  }

  function abandon(quest: Quest) {
    if (!window.confirm(`Abandon “${quest.title}”? Its progress is removed.`)) return;
    setActionError(null);
    actions.abandon.mutate(quest.id, {
      onError: (err) => fail(err, "Could not abandon the quest."),
    });
  }

  const active = data?.active ?? [];
  const completed = data?.completed ?? [];
  const offer = data?.offer ?? null;

  // `?quest=<id>` arrives from a "continue" recommendation (P17): land on the
  // card and outline it, so the deep link answers *which* quest was meant.
  useEffect(() => {
    if (!focusQuest) return;
    document.getElementById(`quest-${focusQuest}`)?.scrollIntoView({ block: "center" });
  }, [focusQuest, active]);

  return (
    <div className="sq-col" style={{ marginTop: "var(--s6)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--s4)" }}>
        <div style={{ flex: 1 }}>
          <h1
            style={{
              font: "var(--t-h1)",
              margin: "0 0 var(--s1)",
              color: "var(--strong)",
              letterSpacing: "-.025em",
            }}
          >
            Quests
          </h1>
          <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
            Study goals, not renamed tasks
          </p>
        </div>
        <Button variant="secondary" onClick={() => setBuilder(true)}>
          + New quest
        </Button>
      </div>

      {actionError && (
        <p className="sq-error" role="alert" style={{ margin: 0 }}>
          {actionError}
        </p>
      )}

      {error && (
        <p className="sq-error" role="alert" style={{ margin: 0 }}>
          {messageOf(error, "Could not load your quests.")}
        </p>
      )}

      {offer && (
        <Card title="Suggested for you">
          <div className="sq-col" style={{ gap: "var(--s3)" }}>
            <div>
              <b style={{ font: "var(--t-body)" }}>{offer.title}</b>
              <span style={{ color: "var(--muted)", font: "var(--t-body-sm)" }}>
                {" "}
                — {offer.subtitle}
              </span>
              <p style={{ margin: "var(--s2) 0 0", color: "var(--muted)", font: "var(--t-body)" }}>
                {offer.reason}
              </p>
            </div>
            <div style={{ display: "flex", gap: "var(--s3)" }}>
              <Button size="sm" onClick={acceptOffer}>
                Start quest
              </Button>
              <Button variant="ghost" size="sm" onClick={declineOffer}>
                Not now
              </Button>
            </div>
          </div>
        </Card>
      )}

      {!isPending && !error && active.length === 0 && !offer && (
        <Card>
          <EmptyState
            title="No quests yet"
            hint="Pick a topic or subject and give it five real steps — notes, summary, cards, quiz, final challenge."
            action={<Button onClick={() => setBuilder(true)}>Start your first quest</Button>}
          />
        </Card>
      )}

      {active.map((quest) => {
        const firstPending = quest.steps.find((s) => s.status === "pending") ?? null;
        const link = firstPending ? stepLink(firstPending) : null;
        const manual = firstPending?.kind === "manual";
        const due = dateOf(quest.dueAt);

        return (
          <div
            key={quest.id}
            id={`quest-${quest.id}`}
            data-focus={focusQuest === quest.id || undefined}
          >
            <Card
              title={quest.title}
              action={
                <span style={{ display: "flex", gap: "var(--s2)", alignItems: "center" }}>
                  <Chip>{KIND_LABEL[quest.kind] ?? quest.kind}</Chip>
                  <b style={{ font: "var(--t-body-sm)" }}>
                    {quest.count
                      ? `${quest.count.progress}/${quest.count.target}`
                      : `${quest.progress.done}/${quest.progress.total}`}
                  </b>
                </span>
              }
            >
              <QuestStepper
                steps={quest.steps.map((s) => ({
                  id: s.id,
                  title: s.title,
                  state: s.state,
                }))}
                onSelect={(id) => {
                  const step = quest.steps.find((s) => s.id === id);
                  if (step) selectStep(quest, step);
                }}
              />

              <div
                style={{
                  display: "flex",
                  gap: "var(--s3)",
                  alignItems: "center",
                  marginTop: "var(--s4)",
                  flexWrap: "wrap",
                }}
              >
                {firstPending && link && (
                  <Button size="sm" onClick={() => navigate(link)}>
                    Continue quest
                  </Button>
                )}
                {firstPending && manual && (
                  <Button size="sm" onClick={() => complete(firstPending)}>
                    Mark “{firstPending.title}” done
                  </Button>
                )}
                {firstPending && !link && !manual && (
                  <span style={{ color: "var(--muted)", font: "var(--t-body-sm)" }}>
                    Counted as you study — no button to press.
                  </span>
                )}
                <span style={{ flex: 1 }} />
                {due && <Chip>Due {due}</Chip>}
                <Chip tone="ok">+{quest.xpReward} XP</Chip>
                <Button variant="ghost" size="sm" onClick={() => abandon(quest)}>
                  Abandon
                </Button>
              </div>
            </Card>
          </div>
        );
      })}

      {completed.length > 0 && (
        <Card title="Completed">
          <ul
            className="sq-col"
            style={{ listStyle: "none", margin: 0, padding: 0, gap: "var(--s2)" }}
          >
            {completed.map((quest) => (
              <li
                key={quest.id}
                style={{
                  display: "flex",
                  gap: "var(--s3)",
                  alignItems: "baseline",
                  font: "var(--t-body)",
                }}
              >
                <span style={{ color: "var(--ok-500)" }} aria-hidden="true">
                  ✓
                </span>
                <b>{quest.title}</b>
                <span style={{ color: "var(--muted)", font: "var(--t-body-sm)" }}>
                  +{quest.xpReward} XP
                  {quest.completedAt ? ` · ${dateOf(quest.completedAt)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {builder && <QuestBuilderDialog onClose={() => setBuilder(false)} />}

      {celebration && (
        <Dialog open onClose={() => setCelebration(null)} title="Quest complete">
          <div
            className="sq-col"
            style={{ alignItems: "center", textAlign: "center", gap: "var(--s3)" }}
          >
            <div className="sq-mono sq-mono-lg sq-mono-active" aria-hidden="true">
              ✓
            </div>
            <b style={{ font: "var(--t-h3)" }}>{celebration.title}</b>
            <Chip tone="ok">+{celebration.xp} XP</Chip>
            <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
              Every step launched real work, and the ledger has the reward.
            </p>
            {/* P17 — one tap onward: the next quest step, or the rest of the day. */}
            <NextUpStrip />
            <Button onClick={() => setCelebration(null)}>Close</Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

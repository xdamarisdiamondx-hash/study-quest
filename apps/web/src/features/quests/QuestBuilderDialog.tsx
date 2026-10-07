/**
 * Quest builder (P13): pick a template, point it at a scope, read the exact
 * steps that will exist before committing — the preview runs the *same*
 * `templateSteps` the server will run on submit, so the list you read is the
 * list you get (ADR-021: one engine, two callers; only the server inserts).
 *
 * PRD §21's five kinds are the five tiles; the offer card on the Quests page is
 * the sixth door in, pre-scoped.
 */
import { useState } from "react";
import { Button, Dialog, Input, Picker } from "@sq/ui";
import {
  QUEST_TEMPLATES,
  templateSteps,
  templateTitle,
  WEEKLY_SESSION_TARGET,
} from "@sq/core/quests";

import type { CreateQuestBody, QuestKind } from "../../lib/questsApi";
import { ApiError } from "../../lib/subjectsApi";
import { useQuestActions } from "../../lib/useQuests";
import { useAllTopics, useSubjects } from "../../lib/useSubjects";

function messageOf(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

const clampTarget = (raw: string) => {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return WEEKLY_SESSION_TARGET;
  // Empty or zero reads as "no opinion" — the default, not a quest for 0 sessions.
  return Math.max(1, Math.min(30, n || WEEKLY_SESSION_TARGET));
};

export function QuestBuilderDialog({ onClose }: { onClose: () => void }) {
  const actions = useQuestActions();
  const subjectsState = useSubjects();
  const topicsState = useAllTopics();

  const [template, setTemplate] = useState<QuestKind | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [targetText, setTargetText] = useState(String(WEEKLY_SESSION_TARGET));
  const [title, setTitle] = useState("");
  const [stepTexts, setStepTexts] = useState<string[]>(["", ""]);

  const liveSubjects = subjectsState.subjects.filter((s) => !s.archived);
  const chosenTopic = topicsState.topics.find((t) => t.id === topicId) ?? null;
  const chosenSubject = liveSubjects.find((s) => s.id === subjectId) ?? null;
  const target = clampTarget(targetText);
  const personalTitles = stepTexts.map((s) => s.trim()).filter(Boolean);

  const scopeNames = {
    topicName: chosenTopic?.name ?? undefined,
    subjectName: chosenSubject?.name ?? undefined,
    target,
  };
  const previewSteps =
    template === "personal"
      ? personalTitles
      : template
        ? templateSteps(template, scopeNames).map((s) => s.title)
        : [];
  const previewTitle =
    template && template !== "personal"
      ? template === "exam" && examName.trim()
        ? `Prepare for ${examName.trim()}`
        : templateTitle(template, scopeNames)
      : title.trim();

  const ready =
    template === "topic"
      ? Boolean(topicId)
      : template === "subject"
        ? Boolean(subjectId)
        : template === "exam"
          ? Boolean(subjectId) && Boolean(examDate)
          : template === "weekly"
            ? true
            : template === "personal"
              ? Boolean(title.trim()) && personalTitles.length > 0
              : false;

  function buildBody(kind: QuestKind): CreateQuestBody {
    switch (kind) {
      case "topic":
        return { template: kind, topicId: topicId! };
      case "subject":
        return { template: kind, subjectId: subjectId! };
      case "exam":
        return {
          template: kind,
          subjectId: subjectId!,
          examDate,
          ...(examName.trim() ? { title: `Prepare for ${examName.trim()}` } : {}),
        };
      case "weekly":
        return { template: kind, target };
      case "personal":
        return {
          template: kind,
          title: title.trim(),
          steps: personalTitles.map((t) => ({ title: t })),
        };
    }
  }

  function start() {
    if (!template || !ready) return;
    actions.create.mutate(buildBody(template), { onSuccess: onClose });
  }

  const labelStyle = { font: "var(--t-body-sm)", color: "var(--muted)", margin: "0 0 var(--s1)" };

  return (
    <Dialog open onClose={onClose} title="New quest">
      <div className="sq-col" style={{ gap: "var(--s4)" }}>
        <div>
          <p style={labelStyle}>Choose a goal</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: "var(--s3)",
            }}
          >
            {QUEST_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplate(t.id)}
                style={{
                  textAlign: "left",
                  padding: "var(--s4)",
                  borderRadius: "var(--r-md)",
                  cursor: "pointer",
                  border: `1px solid ${template === t.id ? "var(--accent)" : "var(--border)"}`,
                  background: template === t.id ? "var(--iris-50)" : "var(--card)",
                  color: "var(--strong)",
                }}
              >
                <b style={{ display: "block", font: "var(--t-body)" }}>{t.name}</b>
                <small style={{ color: "var(--muted)" }}>{t.blurb}</small>
                <span
                  style={{
                    display: "block",
                    marginTop: "var(--s2)",
                    font: "var(--t-body-sm)",
                    color: "var(--muted)",
                  }}
                >
                  +{t.reward} XP
                </span>
              </button>
            ))}
          </div>
        </div>

        {template === "topic" && (
          <Picker
            label="Topic to master"
            value={topicId}
            placeholder="Choose a topic…"
            options={topicsState.topics.map((t) => ({
              value: t.id,
              label: t.name,
              prefix: t.subjectName,
            }))}
            onChange={setTopicId}
          />
        )}

        {template === "subject" && (
          <Picker
            label="Subject to master"
            value={subjectId}
            placeholder="Choose a subject…"
            options={liveSubjects.map((s) => ({ value: s.id, label: s.name, prefix: s.monogram }))}
            onChange={setSubjectId}
          />
        )}

        {template === "exam" && (
          <>
            <Picker
              label="Subject the exam covers"
              value={subjectId}
              placeholder="Choose a subject…"
              options={liveSubjects.map((s) => ({
                value: s.id,
                label: s.name,
                prefix: s.monogram,
              }))}
              onChange={setSubjectId}
            />
            <label htmlFor="quest-exam-name" style={labelStyle}>
              Exam name (optional)
            </label>
            <Input
              id="quest-exam-name"
              value={examName}
              placeholder="Biology Midterm"
              onChange={(e) => setExamName(e.target.value)}
            />
            <label htmlFor="quest-exam-date" style={labelStyle}>
              Exam date
            </label>
            <Input
              id="quest-exam-date"
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
            />
          </>
        )}

        {template === "weekly" && (
          <>
            <label htmlFor="quest-target" style={labelStyle}>
              Sessions this week
            </label>
            <Input
              id="quest-target"
              type="number"
              min={1}
              max={30}
              value={targetText}
              onChange={(e) => setTargetText(e.target.value)}
            />
          </>
        )}

        {template === "personal" && (
          <>
            <label htmlFor="quest-title" style={labelStyle}>
              Quest title
            </label>
            <Input
              id="quest-title"
              value={title}
              placeholder="Improve my Physics score"
              onChange={(e) => setTitle(e.target.value)}
            />
            <div>
              <p style={labelStyle}>Steps</p>
              <div className="sq-col" style={{ gap: "var(--s2)" }}>
                {stepTexts.map((text, i) => (
                  <div key={i} style={{ display: "flex", gap: "var(--s2)" }}>
                    <Input
                      value={text}
                      placeholder={i === 0 ? "Finish past paper 2024" : "Another step"}
                      onChange={(e) =>
                        setStepTexts((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={stepTexts.length <= 1}
                      onClick={() => setStepTexts((prev) => prev.filter((_, j) => j !== i))}
                      title="Remove this step"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={stepTexts.length >= 8}
                  onClick={() => setStepTexts((prev) => [...prev, ""])}
                >
                  Add a step
                </Button>
              </div>
            </div>
          </>
        )}

        {template && previewSteps.length > 0 && (
          <div>
            <p style={labelStyle}>
              What you will do
              {previewTitle ? (
                <>
                  {" "}
                  — quest: <b>{previewTitle}</b>
                </>
              ) : null}
            </p>
            <ol className="sq-col" style={{ gap: "var(--s1)", margin: 0, paddingLeft: "1.4em" }}>
              {previewSteps.map((t, i) => (
                <li key={i} style={{ font: "var(--t-body)" }}>
                  {t}
                </li>
              ))}
            </ol>
          </div>
        )}

        {actions.create.isError && (
          <p className="sq-error" role="alert" style={{ margin: 0 }}>
            {messageOf(actions.create.error, "Could not start the quest.")}
          </p>
        )}

        <div style={{ display: "flex", gap: "var(--s3)", justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={start}
            disabled={!ready}
            title={ready ? undefined : "Choose a scope to start this quest"}
          >
            Start quest
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Study sessions (P14, PRD §26): three ways to sit down and study — Quick
 * Focus (the clock just runs), Focus Session (a chosen plan, optional pomodoro
 * breaks) and Guided Study (Read → Understand → Practice → Quiz → Review over
 * the topic's actual material).
 *
 * The clock is derived from timestamps, never counted in ticks: pause bookkeeping
 * lives in localStorage beside the session's id, so a reload (or a backgrounded
 * tab) shows the same honest number the server will log. Ending is the only
 * write that pays — the summary card comes back with the XP, the streak, any
 * quest the weekly counter just moved, and one suggested next action.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  elapsedMs,
  formatClock,
  pause as pauseClock,
  pomodoroPhase,
  remainingMs,
  resume as resumeClock,
} from "@sq/core/sessions";
import { Button, Card, Chip, Dialog, EmptyState, Picker, QuestStepper, Streak } from "@sq/ui";

import { ApiError } from "../../lib/subjectsApi";
import type {
  SessionStep,
  SessionSummary,
  SessionView,
  StartSessionBody,
} from "../../lib/sessionsApi";
import { useSessionActions, useSessions } from "../../lib/useSessions";
import { useAllTopics } from "../../lib/useSubjects";
import { useTaskList } from "../../lib/useTasks";

const MODE_LABEL: Record<string, string> = {
  quick: "Quick focus",
  focus: "Focus session",
  guided: "Guided study",
};

const MODES: { id: StartSessionBody["mode"]; name: string; blurb: string }[] = [
  { id: "quick", name: "Quick Focus", blurb: "Simply work — the clock just runs." },
  {
    id: "focus",
    name: "Focus Session",
    blurb: "A chosen amount of time, with optional pomodoro breaks.",
  },
  {
    id: "guided",
    name: "Guided Study",
    blurb: "Read → Understand → Practice → Quiz → Review, in order.",
  },
];

const FOCUS_PRESETS = [15, 25, 45, 60];

function messageOf(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * Where a guided stage opens: the topic's reader for reading stages, the
 * subject's flashcards/quizzes tab for practice — `?tab=` is read by
 * SubjectDetailPage (P13). Null means the session has no page to open.
 */
function stageLink(session: SessionView, step: SessionStep): string | null {
  if (!session.subjectId) return null;
  const base = `/study/${session.subjectId}`;
  switch (step.kind) {
    case "read":
    case "understand":
    case "review":
      return session.topicId ? `${base}/${session.topicId}/notes` : `${base}?tab=notes`;
    case "practice":
      return `${base}?tab=flashcards`;
    case "quiz":
      return `${base}?tab=quizzes`;
    default:
      return null;
  }
}

const scopeLine = (s: SessionView) =>
  [s.subjectName, s.topicName].filter(Boolean).join(" / ") || s.taskTitle || "General study";

const minutesLine = (s: SessionView) =>
  s.plannedMin > 0 ? `${s.focusMin} min · planned ${s.plannedMin}` : `${s.focusMin} min`;

/* --- pause bookkeeping ----------------------------------------------------- */

interface StoredTimer {
  id: string;
  pausedAt: number | null;
  pausedAccumMs: number;
  withBreaks: boolean;
}

const timerKey = "sq-session-timer";

/**
 * The saved pause state of the running session, or null when there is none for
 * *this* session — a blob left by an older run never claims a newer clock.
 */
function readTimer(
  sessionId: string,
): { pausedAt: number | null; pausedAccumMs: number; withBreaks: boolean } | null {
  try {
    const raw = localStorage.getItem(timerKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredTimer>;
    if (parsed.id !== sessionId) return null;
    return {
      pausedAt: typeof parsed.pausedAt === "number" ? parsed.pausedAt : null,
      pausedAccumMs: Number(parsed.pausedAccumMs) || 0,
      withBreaks: parsed.withBreaks === true,
    };
  } catch {
    // Storage may be unavailable; the session still runs from startedAt.
    return null;
  }
}

function writeTimer(state: {
  id: string;
  pausedAt: number | null;
  pausedAccumMs: number;
  withBreaks: boolean;
}): void {
  try {
    localStorage.setItem(timerKey, JSON.stringify(state));
  } catch {
    // Not being able to remember a pause is not a reason the session cannot run.
  }
}

function clearTimer(): void {
  try {
    localStorage.removeItem(timerKey);
  } catch {
    // Nothing to clean is the same as cleaned.
  }
}

/* --- the running session --------------------------------------------------- */

function RunningSession({
  active,
  onEnd,
  onError,
  endPending,
}: {
  active: SessionView;
  onEnd: (summary: SessionSummary) => void;
  onError: (message: string) => void;
  endPending: boolean;
}) {
  const actions = useSessionActions();
  const navigate = useNavigate();

  // Hydrated once per mount: one active session at a time, and the page keys
  // this component by the session id, so a swap from another tab remounts it.
  const stored = readTimer(active.id);
  const [timer, setTimer] = useState(() => ({
    startedAt: active.startedAt,
    pausedAt: stored?.pausedAt ?? null,
    pausedAccumMs: stored?.pausedAccumMs ?? 0,
  }));
  const withBreaks = stored?.withBreaks ?? false;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const running = timer.pausedAt === null;
  const elapsed = elapsedMs(timer, now);
  const focus = active.mode === "focus";
  const remaining = remainingMs(active.plannedMin, timer, now);
  const phase =
    focus && withBreaks ? pomodoroPhase(elapsed, Math.min(25, active.plannedMin), 5) : null;

  function togglePause() {
    const next = running ? pauseClock(timer, Date.now()) : resumeClock(timer, Date.now());
    setTimer(next);
    writeTimer({ id: active.id, ...next, withBreaks });
  }

  function finish() {
    actions.end.mutate(
      { sessionId: active.id, pausedMin: Math.round(timer.pausedAccumMs / 60_000) },
      {
        onSuccess: (summary) => {
          clearTimer();
          onEnd(summary);
        },
        onError: (err) => onError(messageOf(err, "Could not finish the session.")),
      },
    );
  }

  const firstPending = active.steps.find((s) => s.status === "pending") ?? null;
  const firstPendingId = firstPending?.id;

  function selectStage(stepId: string) {
    const step = active.steps.find((s) => s.id === stepId);
    if (!step) return;
    if (step.status === "done") {
      if (window.confirm(`Mark “${step.title}” as not done?`)) {
        actions.setStep.mutate(
          { sessionId: active.id, stepId: step.id, status: "pending" },
          { onError: (err) => onError(messageOf(err, "Could not update the stage.")) },
        );
      }
      return;
    }
    // Guided runs in order: only the current stage moves, later ones are a look.
    if (step.id !== firstPendingId) return;
    const link = stageLink(active, step);
    if (link) navigate(link);
  }

  return (
    <Card
      title={MODE_LABEL[active.mode] ?? active.mode}
      action={
        <span style={{ display: "flex", gap: "var(--s2)", alignItems: "center" }}>
          {phase && (
            <Chip tone={phase.kind === "break" ? "ok" : "neutral"}>
              {phase.kind === "break" ? "Break" : `Work ${phase.index}`}
            </Chip>
          )}
          <Chip>{scopeLine(active)}</Chip>
        </span>
      }
    >
      <div className="sq-col" style={{ gap: "var(--s4)", alignItems: "center" }}>
        <div
          aria-live="off"
          style={{
            font: "var(--t-h1)",
            fontVariantNumeric: "tabular-nums",
            color: "var(--strong)",
            letterSpacing: "-.02em",
          }}
        >
          {formatClock(focus ? remaining : elapsed)}
        </div>
        <small style={{ color: "var(--muted)", font: "var(--t-body-sm)" }}>
          {focus
            ? running
              ? `left of ${active.plannedMin} planned`
              : `left of ${active.plannedMin} planned — paused`
            : running
              ? "studied — the clock runs from timestamps"
              : "studied — paused"}
        </small>

        <div style={{ display: "flex", gap: "var(--s3)" }}>
          <Button variant="secondary" onClick={togglePause}>
            {running ? "Pause" : "Resume"}
          </Button>
          <Button onClick={finish} disabled={endPending}>
            {endPending ? "Finishing…" : "Finish session"}
          </Button>
        </div>
      </div>

      {active.steps.length > 0 && (
        <div className="sq-col" style={{ gap: "var(--s3)", marginTop: "var(--s5)" }}>
          <p className="sq-label" style={{ margin: 0, color: "var(--muted)" }}>
            The journey
          </p>
          <QuestStepper
            steps={active.steps.map((s) => ({
              id: s.id,
              title: s.title,
              state:
                s.status === "done"
                  ? ("done" as const)
                  : s.id === firstPendingId
                    ? ("current" as const)
                    : ("locked" as const),
            }))}
            onSelect={selectStage}
          />
          {firstPending && stageLink(active, firstPending) && (
            <div style={{ display: "flex", gap: "var(--s3)", alignItems: "center" }}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const link = stageLink(active, firstPending);
                  if (link) navigate(link);
                }}
              >
                Open “{firstPending.title}”
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  actions.setStep.mutate(
                    { sessionId: active.id, stepId: firstPending.id, status: "done" },
                    { onError: (err) => onError(messageOf(err, "Could not update the stage.")) },
                  )
                }
              >
                Mark “{firstPending.title}” done
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* --- the picker ------------------------------------------------------------ */

function StartPicker({
  onStart,
  busy,
}: {
  onStart: (body: StartSessionBody, withBreaks: boolean) => void;
  busy: boolean;
}) {
  const topicsState = useAllTopics();
  const taskList = useTaskList();

  const [mode, setMode] = useState<StartSessionBody["mode"]>("quick");
  const [topicId, setTopicId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [planned, setPlanned] = useState(25);
  const [withBreaks, setWithBreaks] = useState(false);

  const openTasks = (taskList.data ?? []).filter((t) => t.status === "open");
  const guidedNeedsTopic = mode === "guided" && !topicId;

  function start() {
    const body: StartSessionBody = { mode };
    if (topicId) body.topicId = topicId;
    if (taskId) body.taskId = taskId;
    if (mode === "focus") body.plannedMin = planned;
    onStart(body, withBreaks);
  }

  const labelStyle = { font: "var(--t-body-sm)", color: "var(--muted)", margin: "0 0 var(--s1)" };

  return (
    <Card title="Start a session">
      <div className="sq-col" style={{ gap: "var(--s4)" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: "var(--s3)",
          }}
        >
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              style={{
                textAlign: "left",
                padding: "var(--s4)",
                borderRadius: "var(--r-md)",
                cursor: "pointer",
                border: `1px solid ${mode === m.id ? "var(--accent)" : "var(--border)"}`,
                background: mode === m.id ? "var(--iris-50)" : "var(--card)",
                color: "var(--strong)",
              }}
            >
              <b style={{ display: "block", font: "var(--t-body)" }}>{m.name}</b>
              <small style={{ color: "var(--muted)" }}>{m.blurb}</small>
            </button>
          ))}
        </div>

        <Picker
          label="Topic you're studying"
          value={topicId}
          placeholder="General — no particular topic"
          options={topicsState.topics.map((t) => ({
            value: t.id,
            label: t.name,
            prefix: t.subjectName,
          }))}
          onChange={(v) => setTopicId(v ?? "")}
        />

        {mode === "guided" && !topicId && (
          <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
            Guided Study walks a topic's real material, so pick one above.
          </p>
        )}

        {openTasks.length > 0 && (
          <Picker
            label="Attach a task (optional)"
            value={taskId}
            placeholder="None — just study"
            options={openTasks.map((t) => ({ value: t.id, label: t.title }))}
            onChange={(v) => setTaskId(v ?? "")}
          />
        )}

        {mode === "focus" && (
          <div className="sq-col" style={{ gap: "var(--s2)" }}>
            <p style={labelStyle}>Planned minutes</p>
            <div style={{ display: "flex", gap: "var(--s2)", flexWrap: "wrap" }}>
              {FOCUS_PRESETS.map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={planned === m ? "primary" : "secondary"}
                  onClick={() => setPlanned(m)}
                >
                  {m} min
                </Button>
              ))}
              <Button
                size="sm"
                variant={withBreaks ? "primary" : "secondary"}
                onClick={() => setWithBreaks((v) => !v)}
                title="25 minutes of work, 5-minute breaks in between"
              >
                Pomodoro breaks
              </Button>
            </div>
          </div>
        )}

        <div>
          <Button onClick={start} disabled={busy || guidedNeedsTopic}>
            {busy ? "Starting…" : "Start session"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* --- the page -------------------------------------------------------------- */

export function SessionsPage() {
  const { data, isPending, error } = useSessions();
  const actions = useSessionActions();
  const [actionError, setActionError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  const active = data?.active ?? null;
  const recent = data?.recent ?? [];

  function fail(err: unknown, fallback: string) {
    setActionError(messageOf(err, fallback));
  }

  function start(body: StartSessionBody, withBreaks: boolean) {
    setActionError(null);
    actions.start.mutate(body, {
      onSuccess: ({ session }) => {
        // The blob starts with the session: this tab's pause bookkeeping and its
        // pomodoro choice belong to *this* id, so a reload (or an older leftover)
        // can only ever restore the right clock.
        writeTimer({ id: session.id, pausedAt: null, pausedAccumMs: 0, withBreaks });
      },
      // A 409 means another tab holds the session — refetch shows it running.
      onError: (err) => {
        if (err instanceof ApiError && err.status === 409) return;
        fail(err, "Could not start the session.");
      },
    });
  }

  return (
    <div className="sq-col" style={{ marginTop: "var(--s6)" }}>
      <div style={{ flex: 1 }}>
        <h1
          style={{
            font: "var(--t-h1)",
            margin: "0 0 var(--s1)",
            color: "var(--strong)",
            letterSpacing: "-.025em",
          }}
        >
          Study sessions
        </h1>
        <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
          Three ways to sit down and study
        </p>
      </div>

      {actionError && (
        <p className="sq-error" role="alert" style={{ margin: 0 }}>
          {actionError}
        </p>
      )}
      {error && (
        <p className="sq-error" role="alert" style={{ margin: 0 }}>
          {messageOf(error, "Could not load your sessions.")}
        </p>
      )}
      {isPending && (
        <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>Loading…</p>
      )}

      {!isPending && active && (
        <RunningSession
          key={active.id}
          active={active}
          endPending={actions.end.isPending}
          onEnd={(s) => {
            setActionError(null);
            setSummary(s);
          }}
          onError={(m) => setActionError(m)}
        />
      )}

      {!isPending && !active && (
        <>
          <StartPicker busy={actions.start.isPending} onStart={start} />

          <Card title="Recent sessions">
            {recent.length === 0 ? (
              <EmptyState
                title="Nothing logged yet"
                hint="A finished session lands here with its minutes, its mode and its XP."
              />
            ) : (
              recent.map((s) => (
                <div
                  key={s.id}
                  className="sq-row"
                  style={{ padding: "var(--s2) 0", gap: "var(--s3)", flexWrap: "nowrap" }}
                >
                  <Chip>{MODE_LABEL[s.mode] ?? s.mode}</Chip>
                  <span style={{ flex: 1, minWidth: 0, font: "var(--t-body-sm)" }}>
                    {scopeLine(s)}
                  </span>
                  <span
                    style={{
                      color: "var(--muted)",
                      font: "var(--t-body-sm)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {minutesLine(s)}
                  </span>
                </div>
              ))
            )}
          </Card>
        </>
      )}

      <Dialog
        open={summary !== null}
        onClose={() => setSummary(null)}
        title={summary ? `${MODE_LABEL[summary.session.mode] ?? "Session"} complete` : ""}
      >
        {summary && (
          <div className="sq-col" style={{ gap: "var(--s3)" }}>
            <p style={{ margin: 0, color: "var(--strong)", font: "var(--t-body)" }}>
              {summary.session.focusMin} minutes
              {summary.session.plannedMin > 0
                ? ` of ${summary.session.plannedMin} planned`
                : ""} in {scopeLine(summary.session)}
            </p>
            <div style={{ display: "flex", gap: "var(--s2)", flexWrap: "wrap" }}>
              <Chip tone="ok">+{summary.xp} XP</Chip>
              {summary.streak.current > 0 && <Streak days={summary.streak.current} />}
              {summary.quest.stepsCompleted > 0 && (
                <Chip tone="ok">Quest step +{summary.quest.xpAwarded} XP</Chip>
              )}
              {summary.quest.questsCompleted.map((q) => (
                <Chip key={q.id} tone="ok">
                  {q.title} complete +{q.xp} XP
                </Chip>
              ))}
            </div>
            {summary.next && (
              <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body)" }}>
                Next: {summary.next}
              </p>
            )}
            <div>
              <Button onClick={() => setSummary(null)}>Done</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

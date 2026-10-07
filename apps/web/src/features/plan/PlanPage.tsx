/**
 * Plan (P12): today in one artifact — the mode the student plans in, the capacity
 * they have, the tray they accept from, and the timeline they rearrange.
 *
 * These rows are also the home screen's Today's Quest (A.8): same storage, same
 * engine, two presentations — so the quest can never disagree with the plan.
 * Generation itself lives server-side in `@sq/core/planning`; this page only asks.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Card, EmptyState, Picker, Track } from "@sq/ui";
import { localDate, PLAN_MODES, type PlanMode } from "@sq/core/planning";
import { move } from "@sq/core/subjects";

import { useAllTopics, useSubjects } from "../../lib/useSubjects";
import { planKeys, usePlanActions, usePlanDay } from "../../lib/usePlan";
import { useTaskList } from "../../lib/useTasks";
import type { AddBlockInput, PlanDay } from "../../lib/planApi";
import { BlockRow } from "./BlockRow";
import { SuggestionCard } from "./SuggestionCard";

const MODE_HINT: Record<PlanMode, string> = {
  manual: "Your schedule, your rules — nothing is added or cleared for you.",
  suggested: "We propose the day; you accept or decline each item.",
  automatic: "The day fills itself to your capacity, from deadlines and mastery.",
};

export function PlanPage() {
  const date = localDate(new Date());
  const day = usePlanDay(date);
  const actions = usePlanActions();
  const queryClient = useQueryClient();
  const taskList = useTaskList();
  const allTopics = useAllTopics();
  const subjects = useSubjects();

  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [addChoice, setAddChoice] = useState<string | null>(null);
  const [addMinutes, setAddMinutes] = useState("20");

  const mutations = [
    actions.setMode,
    actions.generate,
    actions.add,
    actions.dismiss,
    actions.patch,
    actions.remove,
    actions.reorder,
    actions.setCapacity,
  ];
  const busy = mutations.some((m) => m.isPending);

  const blocks = day.data?.blocks ?? [];
  const suggestions = day.data?.suggestions ?? [];
  const load = day.data?.load;
  const capacityMin = day.data?.capacityMin ?? 120;
  const mode = day.data?.plan.mode ?? "suggested";

  const openTasks = (taskList.data ?? []).filter((t) => t.status === "open");
  const subjectName = (id: string | null): string | null =>
    id ? (subjects.subjects.find((s) => s.id === id)?.name ?? null) : null;

  /** Optimistic mode: the chips update the cache at once so Regenerate can't read a stale mode. */
  function pickMode(next: PlanMode) {
    const prev = queryClient.getQueryData<PlanDay>(planKeys.day(date));
    if (prev) {
      queryClient.setQueryData(planKeys.day(date), {
        ...prev,
        plan: { ...prev.plan, mode: next },
      });
    }
    actions.setMode.mutate(
      { date, mode: next },
      { onError: () => void queryClient.invalidateQueries({ queryKey: planKeys.all }) },
    );
  }

  /** Optimistic reorder — the order is unambiguous, so the list moves before the round trip. */
  function applyOrder(ids: string[]) {
    const prev = queryClient.getQueryData<PlanDay>(planKeys.day(date));
    if (prev) {
      const byId = new Map(prev.blocks.map((b) => [b.id, b]));
      queryClient.setQueryData(planKeys.day(date), {
        ...prev,
        blocks: ids.flatMap((id) => byId.get(id) ?? []),
      });
    }
    actions.reorder.mutate(
      { date, ids },
      { onError: () => void queryClient.invalidateQueries({ queryKey: planKeys.all }) },
    );
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = blocks.map((b) => b.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    applyOrder(move(ids, from, to));
  }

  function onPick(value: string | null) {
    setAddChoice(value);
    if (!value) return;
    const [kind, id] = value.split(":");
    if (kind === "task") {
      const task = openTasks.find((t) => t.id === id);
      setAddMinutes(String(task && task.estimateMin > 0 ? task.estimateMin : 25));
    } else {
      setAddMinutes("20");
    }
  }

  function addBlock() {
    if (!addChoice) return;
    const [kind, id] = addChoice.split(":");
    if (!kind || !id) return;
    const minutes = Math.min(600, Math.max(1, Number.parseInt(addMinutes, 10) || 20));
    const block: AddBlockInput = {
      kind: kind === "task" ? "task" : "topic",
      refId: id,
      plannedMin: minutes,
    };
    actions.add.mutate({ date, blocks: [block] }, { onSuccess: () => setAddChoice(null) });
  }

  const addOptions = [
    ...openTasks.map((t) => ({
      value: `task:${t.id}`,
      label: t.title,
      prefix: subjectName(t.subjectId) ?? "Task",
    })),
    ...allTopics.topics.map((t) => ({
      value: `topic:${t.id}`,
      label: t.name,
      prefix: t.subjectName,
    })),
  ];

  if (day.isPending) {
    return (
      <div className="sq-col" style={{ marginTop: "var(--s6)" }}>
        <h1 style={{ font: "var(--t-h1)", margin: "0 0 var(--s4)", color: "var(--strong)" }}>
          Plan
        </h1>
        <Card>
          <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>Loading…</p>
        </Card>
      </div>
    );
  }

  if (day.isError) {
    return (
      <div className="sq-col" style={{ marginTop: "var(--s6)" }}>
        <h1 style={{ font: "var(--t-h1)", margin: "0 0 var(--s4)", color: "var(--strong)" }}>
          Plan
        </h1>
        <p className="sq-error" role="alert">
          Could not load today's plan.
        </p>
      </div>
    );
  }

  const actionError = mutations.some((m) => m.isError);

  return (
    <div className="sq-col" style={{ marginTop: "var(--s6)" }}>
      <div className="sq-row" style={{ alignItems: "flex-start", gap: "var(--s4)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              font: "var(--t-h1)",
              margin: "0 0 var(--s1)",
              color: "var(--strong)",
              letterSpacing: "-.025em",
            }}
          >
            Plan
          </h1>
          <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
            {" · "}
            {blocks.length} block{blocks.length === 1 ? "" : "s"}
          </p>
        </div>
        {mode !== "manual" ? (
          <Button
            variant="secondary"
            disabled={busy}
            title="Rebuild the day — keeps what you've finished"
            onClick={() => actions.generate.mutate({ date, mode })}
          >
            Regenerate
          </Button>
        ) : null}
      </div>

      <div className="sq-row" style={{ gap: "var(--s2)", flexWrap: "wrap" }}>
        {PLAN_MODES.map((m) => (
          <button
            key={m}
            type="button"
            className={mode === m ? "sq-chip sq-chip-accent" : "sq-chip"}
            aria-pressed={mode === m}
            disabled={busy}
            onClick={() => pickMode(m)}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
        <span className="sq-label">{MODE_HINT[mode]}</span>
      </div>

      <Card>
        <div className="sq-row" style={{ gap: "var(--s4)", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <Track
              label="Planned time"
              value={load?.plannedMin ?? 0}
              max={capacityMin}
              caption={`${load?.plannedMin ?? 0} / ${capacityMin} min${load?.over ? " · over" : ""}`}
            />
          </div>
          <label className="sq-row" style={{ gap: 6, alignItems: "center" }}>
            <span className="sq-label">Available</span>
            <input
              key={capacityMin}
              className="sq-input"
              style={{ width: 64, textAlign: "right" }}
              inputMode="numeric"
              aria-label="Available study minutes per day"
              defaultValue={capacityMin}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              onBlur={(e) => {
                const parsed = Number.parseInt(e.target.value, 10);
                if (!Number.isNaN(parsed) && parsed !== capacityMin) {
                  actions.setCapacity.mutate(Math.min(600, Math.max(15, parsed)));
                }
              }}
            />
            <span className="sq-label">min/day</span>
          </label>
        </div>
      </Card>

      {mode === "suggested" ? (
        <Card
          title="Suggested for today"
          action={
            <span className="sq-num" style={{ fontSize: 13, color: "var(--muted)" }}>
              {suggestions.length}
            </span>
          }
        >
          {suggestions.length === 0 ? (
            <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
              Nothing to suggest — open tasks due within the week would appear here, ready to
              accept.
            </p>
          ) : (
            suggestions.map((candidate) => (
              <SuggestionCard
                key={candidate.task.id}
                candidate={candidate}
                busy={busy}
                onAcceptPrep={() => {
                  const suggestion = candidate.suggestion;
                  if (!suggestion) return;
                  actions.add.mutate({
                    date,
                    blocks: suggestion.steps.map((s) => ({
                      kind: s.kind,
                      refId: s.refId,
                      plannedMin: s.plannedMin,
                    })),
                  });
                }}
                onSchedule={() =>
                  actions.add.mutate({
                    date,
                    blocks: [
                      {
                        kind: "task",
                        refId: candidate.task.id,
                        plannedMin: candidate.taskMinutes,
                      },
                    ],
                  })
                }
                onDismiss={() => actions.dismiss.mutate({ date, taskId: candidate.task.id })}
              />
            ))
          )}
        </Card>
      ) : null}

      <Card title="Today" action={<span className="sq-label">drag or use the arrows</span>}>
        {blocks.length === 0 ? (
          <EmptyState
            title={mode === "automatic" ? "Your day hasn't been built yet" : "Nothing planned yet"}
            hint={
              mode === "automatic"
                ? "Generate fills today from your deadlines and your weakest topics, up to your capacity."
                : mode === "suggested"
                  ? "Accept a suggestion above, or add a block below — the day is yours to shape."
                  : "Add your first block below: a task to work through, or a topic to review."
            }
            action={
              mode === "automatic" ? (
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => actions.generate.mutate({ date, mode })}
                >
                  Generate today's plan
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {blocks.map((block, index) => (
              <BlockRow
                key={block.id}
                block={block}
                index={index}
                total={blocks.length}
                busy={busy}
                isDragging={dragId === block.id}
                isDropTarget={overId === block.id && dragId !== block.id}
                onToggle={() =>
                  actions.patch.mutate({
                    id: block.id,
                    patch: { status: block.status === "done" ? "pending" : "done" },
                  })
                }
                onMinutes={(minutes) =>
                  actions.patch.mutate({ id: block.id, patch: { plannedMin: minutes } })
                }
                onMove={(from, to) =>
                  applyOrder(
                    move(
                      blocks.map((b) => b.id),
                      from,
                      to,
                    ),
                  )
                }
                onDelete={() => actions.remove.mutate(block.id)}
                onDragStart={() => setDragId(block.id)}
                onDragOver={() => {
                  if (overId !== block.id) setOverId(block.id);
                }}
                onDragLeave={() => setOverId((id) => (id === block.id ? null : id))}
                onDrop={() => onDrop(block.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
              />
            ))}
          </ul>
        )}

        <div
          className="sq-row"
          style={{ gap: "var(--s3)", marginTop: "var(--s4)", alignItems: "flex-end" }}
        >
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <Picker
              label="Add block"
              value={addChoice}
              options={addOptions}
              onChange={onPick}
              placeholder={
                addOptions.length === 0 ? "Nothing to add yet" : "Choose a task or topic"
              }
            />
          </div>
          <div className="sq-field" style={{ width: 86 }}>
            <label htmlFor="plan-add-minutes">Minutes</label>
            <input
              id="plan-add-minutes"
              className="sq-input"
              inputMode="numeric"
              aria-label="Minutes for the new block"
              value={addMinutes}
              onChange={(e) => setAddMinutes(e.target.value)}
            />
          </div>
          <Button variant="secondary" disabled={!addChoice || busy} onClick={addBlock}>
            Add
          </Button>
        </div>
      </Card>

      {actionError ? (
        <p className="sq-error" role="alert" style={{ margin: 0 }}>
          That didn't save. Try again.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Planning (P12): task suggestions, day generation, and the daily quest — rules, not
 * an AI call (PRD sections 17–19).
 *
 * Three planning modes share one artifact: the day's plan (plans + plan_blocks, present
 * since migration 0000). "Manual" is the student's own rows, "suggested" offers
 * candidates the student accepts or dismisses, "automatic" fills the day from
 * deadlines and mastery up to the capacity. The Daily Quest on the home screen is the
 * same rows grouped by subject (A.8) — one generator, two presentations, so the quest
 * can never disagree with the plan.
 *
 * Everything here is a pure function over snapshots (tasks, topics with their mastery
 * and material, existing rows), so the whole engine tests without a database
 * (ADR-021). Generation is deterministic on purpose: instant, free, and reviewable —
 * the AI recommendations arrive in P17 on top of these same signals.
 */

import { dueLabel, priorityRank, startOfDay } from "../tasks/index.ts";

/* --- vocabulary ----------------------------------------------------------- */

export const PLAN_MODES = ["manual", "suggested", "automatic"] as const;
export type PlanMode = (typeof PLAN_MODES)[number];

export const BLOCK_KINDS = ["task", "topic", "review", "quiz", "flashcards", "session"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export type BlockStatus = "pending" | "done" | "dismissed";

/** A day is never a to-do dump: generated plans stop at this many blocks (A.8). */
export const MAX_GENERATED_BLOCKS = 6;

/** What "available study time" means until the student says otherwise. */
export const DEFAULT_CAPACITY_MIN = 120;

/** Candidate tasks are offered while they are still actionable — a week out, at most. */
export const CANDIDATE_WINDOW_DAYS = 7;

/* --- inputs --------------------------------------------------------------- */

export interface TaskSnapshot {
  id: string;
  title: string;
  subjectId: string | null;
  topicId: string | null;
  kind: string;
  priority: string;
  /** ISO instant; null = undated. */
  dueAt: string | null;
  estimateMin: number;
}

export interface TopicAssets {
  notes: number;
  cards: number;
  dueCards: number;
  quizzes: number;
}

export interface TopicSnapshot {
  id: string;
  subjectId: string | null;
  name: string;
  status: string;
  lastStudiedAt: string | null;
  /** 0..1 across quiz attempts, or null when the topic has never been quizzed. */
  mastery: number | null;
  assets: TopicAssets;
}

export interface BlockSnapshot {
  id: string;
  kind: BlockKind;
  refId: string | null;
  plannedMin: number;
  status: BlockStatus;
}

export interface BlockDraft {
  kind: BlockKind;
  refId: string;
  plannedMin: number;
}

/* --- suggestions (PRD section 17) ------------------------------------------ */

export interface PrepStep {
  kind: "review" | "flashcards" | "quiz";
  /** The topic every step prepares — also the plan block's ref. */
  refId: string;
  label: string;
  plannedMin: number;
}

export interface TaskSuggestion {
  taskId: string;
  /** "Review Motion for 20 minutes, then take a short quiz" */
  headline: string;
  /** Why this, why now — mastery and the deadline, stated plainly. */
  reason: string;
  steps: PrepStep[];
}

const DAY_MS = 86_400_000;

/** Whole calendar days from `now` to `dueAt` (negative = overdue). */
export function daysUntil(dueAt: string | Date, now: Date): number {
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  return Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / DAY_MS);
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Prep worth doing before a task: review when there are notes, clear the card backlog
 * when there is one, quiz when a quiz exists. The minutes scale with the deadline —
 * close work gets a short, honest block instead of a heroic plan it will miss.
 * Returns null when the task has no topic or the topic has nothing to study from.
 */
export function suggestForTask(
  task: TaskSnapshot,
  topic: TopicSnapshot | null,
  now: Date,
): TaskSuggestion | null {
  if (!topic || topic.id !== task.topicId) return null;
  const { notes, cards, dueCards, quizzes } = topic.assets;
  if (notes === 0 && cards === 0 && quizzes === 0) return null;

  const due = task.dueAt ? daysUntil(task.dueAt, now) : null;
  const minutes = due === null ? 25 : due <= 0 ? 15 : due <= 3 ? 20 : due <= 6 ? 25 : 30;

  const mastery = topic.mastery;
  const weak = mastery === null || mastery < 0.6;
  const steps: PrepStep[] = [];

  if (notes > 0) {
    steps.push({
      kind: "review",
      refId: topic.id,
      label: `Review ${topic.name}`,
      plannedMin: minutes,
    });
  }
  if (dueCards > 0 || (cards > 0 && quizzes === 0)) {
    steps.push({
      kind: "flashcards",
      refId: topic.id,
      label: `${topic.name} flashcards`,
      plannedMin: Math.min(10, minutes),
    });
  }
  // A well-known topic still gets one check — proof, not review.
  if (quizzes > 0 && (weak || (mastery ?? 1) < 0.85)) {
    steps.push({
      kind: "quiz",
      refId: topic.id,
      label: `A short ${topic.name} quiz`,
      plannedMin: 10,
    });
  }
  if (steps.length === 0) return null;

  const phrases = steps.map((s) => {
    if (s.kind === "review") return `Review ${topic.name} for ${s.plannedMin} minutes`;
    if (s.kind === "flashcards") return `run ${topic.name} flashcards for ${s.plannedMin} minutes`;
    return "take a short quiz";
  });
  const joined = phrases.join(", then ");
  const headline = joined.charAt(0).toUpperCase() + joined.slice(1);

  const pct = mastery === null ? null : Math.round(mastery * 100);
  const why =
    pct === null
      ? `${topic.name} has not been quizzed yet`
      : weak
        ? `${topic.name} sits at ${pct}% mastery`
        : `${topic.name} is at ${pct}% mastery`;
  // Lowercase only the relative words; "Fri" stays a name, not a stutter.
  const dl = task.dueAt ? dueLabel(task.dueAt, now) : null;
  const when =
    dl !== null
      ? `, and the task is due ${dl === "Today" || dl === "Tomorrow" || dl === "Yesterday" ? lower(dl) : dl}`
      : "";

  return { taskId: task.id, headline, reason: why + when, steps };
}

/* --- suggested-mode candidates --------------------------------------------- */

export interface DayCandidate {
  task: TaskSnapshot;
  /** Human due label for the tray ("Yesterday", "Fri", "5 Nov"). */
  due: string;
  /** Minutes to reserve for the task itself if the student schedules it. */
  taskMinutes: number;
  suggestion: TaskSuggestion | null;
}

export interface CandidateInput {
  /** Open tasks only. */
  tasks: TaskSnapshot[];
  topicsById: Record<string, TopicSnapshot>;
  /** Refs with an existing row of any status — blocked, done or dismissed stay out. */
  blockedRefs: readonly string[];
  now: Date;
}

function urgencyScore(dueAt: string | null, now: Date): number {
  // Undated work sorts below anything dated at all — a deadline beats an intention.
  if (!dueAt) return -20;
  const d = daysUntil(dueAt, now);
  if (d < 0) return 80 + Math.min(14, -d) * 3;
  if (d === 0) return 60;
  if (d === 1) return 45;
  if (d <= 3) return 35;
  if (d <= CANDIDATE_WINDOW_DAYS) return 25;
  return 8;
}

function priorityBonus(priority: string): number {
  const rank = priorityRank(priority);
  return rank === 0 ? 12 : rank === 2 ? -6 : 0;
}

function taskScore(task: TaskSnapshot, now: Date): number {
  const kindBonus = task.kind === "assignment" || task.kind === "homework" ? 4 : 0;
  return urgencyScore(task.dueAt, now) + priorityBonus(task.priority) + kindBonus;
}

/**
 * What the suggested tray offers: open tasks that are overdue or due within the week,
 * most pressing first, capped like everything else this engine generates. Tasks with
 * no deadline only surface when there is nothing dated to do.
 */
export function dayCandidates(input: CandidateInput): DayCandidate[] {
  const blocked = new Set(input.blockedRefs);
  return input.tasks
    .filter((t) => !blocked.has(t.id))
    .filter((t) => !t.dueAt || daysUntil(t.dueAt, input.now) <= CANDIDATE_WINDOW_DAYS)
    .sort((a, b) => taskScore(b, input.now) - taskScore(a, input.now))
    .slice(0, MAX_GENERATED_BLOCKS)
    .map((task) => {
      const topic = task.topicId ? (input.topicsById[task.topicId] ?? null) : null;
      return {
        task,
        due: task.dueAt ? dueLabel(task.dueAt, input.now) : "No date",
        taskMinutes: task.estimateMin > 0 ? task.estimateMin : 25,
        suggestion: suggestForTask(task, topic, input.now),
      };
    });
}

/* --- automatic generation --------------------------------------------------- */

export interface GenerateInput {
  /** Open tasks only. */
  tasks: TaskSnapshot[];
  topics: TopicSnapshot[];
  /** Rows kept through a regenerate — already-done work counts against capacity. */
  keep: readonly BlockSnapshot[];
  /** Refs the engine must not schedule again (dismissed, or already kept). */
  excludeRefs: readonly string[];
  capacityMin: number;
  now: Date;
}

function fillScore(topic: TopicSnapshot): number {
  const hasMaterial = topic.assets.notes + topic.assets.cards + topic.assets.quizzes > 0;
  if (!hasMaterial) return -1;
  const mastery = topic.mastery;
  let score = mastery === null ? 50 : mastery < 0.6 ? 40 : mastery < 0.85 ? 15 : 0;
  if (topic.assets.dueCards > 0) score += 25;
  if (topic.status === "mastered") score -= 20;
  return score;
}

/**
 * The automatic day: overdue and imminent tasks first (each a time box sized by its
 * estimate), then the weakest reviewable topics until capacity or the block cap says
 * stop. Empty space is left empty on purpose — padding a plan to look busy is how
 * plans lose trust.
 */
export function generateBlocks(input: GenerateInput): BlockDraft[] {
  const excluded = new Set(input.excludeRefs);
  for (const block of input.keep) if (block.refId) excluded.add(block.refId);

  let left = input.capacityMin;
  for (const block of input.keep) left -= block.plannedMin;

  const drafts: BlockDraft[] = [];

  const ranked = input.tasks
    .filter((t) => !excluded.has(t.id))
    .sort((a, b) => taskScore(b, input.now) - taskScore(a, input.now));

  for (const task of ranked) {
    if (drafts.length >= MAX_GENERATED_BLOCKS || left < 10) break;
    const wanted = task.estimateMin > 0 ? task.estimateMin : 25;
    const plannedMin = Math.min(wanted, left);
    drafts.push({ kind: "task", refId: task.id, plannedMin });
    excluded.add(task.id);
    left -= plannedMin;
  }

  const fills = input.topics
    .filter((t) => !excluded.has(t.id))
    .map((t) => ({ topic: t, score: fillScore(t) }))
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const { topic } of fills) {
    if (drafts.length >= MAX_GENERATED_BLOCKS || left < 10) break;
    const plannedMin = Math.min(20, left);
    const kind: BlockKind = topic.assets.notes > 0 ? "review" : "flashcards";
    drafts.push({ kind, refId: topic.id, plannedMin });
    excluded.add(topic.id);
    left -= plannedMin;
  }

  return drafts;
}

/* --- capacity --------------------------------------------------------------- */

export interface PlanLoad {
  plannedMin: number;
  doneMin: number;
  capacityMin: number;
  remainingMin: number;
  /** 0..1+ — over 1 means the day is oversubscribed. */
  ratio: number;
  over: boolean;
}

/** How much of the day's available time the visible blocks consume. */
export function planLoad(blocks: readonly BlockSnapshot[], capacityMin: number): PlanLoad {
  let planned = 0;
  let done = 0;
  for (const b of blocks) {
    if (b.status === "dismissed") continue;
    planned += b.plannedMin;
    if (b.status === "done") done += b.plannedMin;
  }
  const capacity = Math.max(1, capacityMin);
  return {
    plannedMin: planned,
    doneMin: done,
    capacityMin,
    remainingMin: capacityMin - planned,
    ratio: planned / capacity,
    over: planned > capacityMin,
  };
}

/* --- the daily quest (PRD section 19) --------------------------------------- */

export interface QuestItem {
  blockId: string;
  title: string;
  kind: BlockKind;
  subjectId: string | null;
  subjectName: string | null;
  minutes: number;
  done: boolean;
}

export interface QuestGroup {
  subjectId: string | null;
  subjectName: string;
  items: QuestItem[];
}

/**
 * The quest presentation of a day: grouped by subject in the order the day introduces
 * them, finished items still in place so progress reads honestly ("2/4", not "2/2").
 */
export function groupQuest(items: readonly QuestItem[]): QuestGroup[] {
  const groups: QuestGroup[] = [];
  const bySubject = new Map<string | null, QuestGroup>();
  for (const item of items) {
    let group = bySubject.get(item.subjectId);
    if (!group) {
      group = {
        subjectId: item.subjectId,
        subjectName: item.subjectName ?? "No subject",
        items: [],
      };
      bySubject.set(item.subjectId, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

/* --- display helpers --------------------------------------------------------- */

/** Title a block earns from its reference — the server joins, this keeps wording shared. */
export function blockTitle(kind: BlockKind, ref: { title?: string; name?: string }): string {
  const name = ref.name ?? ref.title ?? "Untitled";
  switch (kind) {
    case "task":
      return ref.title ?? "Task";
    case "review":
      return `Review ${name}`;
    case "quiz":
      return `Quiz: ${name}`;
    case "flashcards":
      return `Flashcards: ${name}`;
    default:
      return name;
  }
}

/** Local calendar date (YYYY-MM-DD) — the key plans are stored under. */
export function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

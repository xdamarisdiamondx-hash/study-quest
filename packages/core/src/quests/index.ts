/**
 * Quest engine (P13): templates, step states, signal matching and the offer rule —
 * pure functions over snapshots, no I/O (same shape as `planning` in P12).
 *
 * Quests are study goals, not renamed tasks (PRD §20): a quest's steps reference
 * *real activities* — read notes, review a summary, study flashcards, take a quiz,
 * pass the final challenge — and the work itself marks the steps (PRD §17's
 * deep-link-and-auto-complete). The rules that decide which signal completes which
 * step live here so they are testable without a database.
 *
 * Two deliberate choices, recorded in PRD A.8:
 *
 * - Step states are a *display* order, not a gate: a step completed out of order
 *   (quiz passed before the notes were read) stays done — work never gets thrown
 *   away because the student did things their own way (principle 4).
 * - The offer rule returns at most one candidate (PRD §21: special quests must be
 *   occasional, never a wall), and a declined scope is never offered again.
 */

/* --- kinds ---------------------------------------------------------------- */

export const QUEST_KINDS = ["topic", "subject", "exam", "weekly", "personal"] as const;
export type QuestKind = (typeof QUEST_KINDS)[number];

export const QUEST_STEP_KINDS = [
  "read_notes",
  "review_summary",
  "study_flashcards",
  "complete_quiz",
  "final_challenge",
  "study_sessions", // count step: completed by reaching its target
  "manual", // no automatic signal — the student marks it done
] as const;
export type QuestStepKind = (typeof QUEST_STEP_KINDS)[number];

/** What counts as *passing* the final challenge (PRD §20's "pass"). */
export const PASS_SCORE = 0.8;

/** A single count step's default target (PRD §21's "5 study sessions this week"). */
export const WEEKLY_SESSION_TARGET = 5;

/* --- step states ----------------------------------------------------------- */

export type StepState = "done" | "current" | "locked";

export interface QuestStepSnapshot {
  id: string;
  orderIndex: number;
  kind: QuestStepKind;
  required: boolean;
  status: "pending" | "done";
  target: number;
  progress: number;
  refType: string | null;
  refId: string | null;
}

/**
 * Sequential display over ordered steps: done stays done; the first pending step
 * whose required predecessors are all done is *current*; the rest are *locked*.
 * Locking is presentation — completion accepts any pending step, so an
 * out-of-order finish simply shows ✓ where a 🔒 was.
 */
export function stepStates(steps: readonly QuestStepSnapshot[]): StepState[] {
  const ordered = [...steps].sort((a, b) => a.orderIndex - b.orderIndex);
  let gateHeld = false;
  return ordered.map((step) => {
    if (step.status === "done") return "done";
    // Optional steps are always available; only a required step that is still
    // pending closes the gate for the required steps after it.
    const state: StepState = gateHeld && step.required ? "locked" : "current";
    if (step.required) gateHeld = true;
    return state;
  });
}

export interface QuestProgress {
  done: number;
  total: number;
}

export function questProgress(steps: readonly QuestStepSnapshot[]): QuestProgress {
  return {
    done: steps.filter((s) => s.status === "done").length,
    total: steps.length,
  };
}

/** A count step's live tally, for cards that read "2/5 sessions". */
export function countProgress(
  steps: readonly QuestStepSnapshot[],
): { progress: number; target: number } | null {
  const counter = steps.find((s) => s.target > 1);
  return counter ? { progress: counter.progress, target: counter.target } : null;
}

export function isQuestComplete(steps: readonly QuestStepSnapshot[]): boolean {
  const required = steps.filter((s) => s.required);
  return required.length > 0 && required.every((s) => s.status === "done");
}

/* --- signals --------------------------------------------------------------- */

export type SignalType = "notes_opened" | "summary" | "flashcards" | "quiz" | "session";

export interface SignalContext {
  type: SignalType;
  /** Topics the activity touched — scope for topic-level steps. */
  topicIds: readonly string[];
  /** Subjects those topics belong to — scope for subject-level steps. */
  subjectIds: readonly string[];
  /** Quiz score as a 0..1 ratio; needed to gate the final challenge. */
  score?: number;
}

export type SignalMatch = "done" | "count" | "none";

interface SignalStep {
  kind: QuestStepKind;
  refType: string | null;
  refId: string | null;
  status: "pending" | "done";
  target: number;
  progress: number;
}

const SIGNAL_KINDS: Record<SignalType, readonly QuestStepKind[]> = {
  notes_opened: ["read_notes"],
  summary: ["review_summary"],
  flashcards: ["study_flashcards"],
  quiz: ["complete_quiz", "final_challenge"],
  session: ["study_sessions"],
};

/**
 * Does this signal complete (or count toward) this step?
 *
 * Matching is kind + scope: a quiz taken in Motion completes a Motion step and,
 * through the topic→subject join done by the caller, a Physics step — but never a
 * Chemistry one. The final challenge additionally requires PASS_SCORE, and a count
 * step only ever moves on a session signal.
 */
export function signalMatch(step: SignalStep, ctx: SignalContext): SignalMatch {
  if (step.status === "done") return "none";
  if (!SIGNAL_KINDS[ctx.type].includes(step.kind)) return "none";

  if (step.kind === "study_sessions") return "count";

  if (step.kind === "final_challenge" && (ctx.score ?? 0) < PASS_SCORE) return "none";

  if (step.refType === "topic") {
    return ctx.topicIds.includes(step.refId ?? "") ? "done" : "none";
  }
  if (step.refType === "subject") {
    return ctx.subjectIds.includes(step.refId ?? "") ? "done" : "none";
  }
  return "none";
}

/** A count step completes the moment it reaches its target. */
export function countReachesTarget(progress: number, target: number): boolean {
  return progress >= target;
}

/* --- templates ------------------------------------------------------------- */

export interface QuestTemplate {
  id: QuestKind;
  name: string;
  blurb: string;
  /** What the builder must collect before this template can be created. */
  needs: "topic" | "subject" | "exam" | "none" | "custom";
  reward: number;
}

/**
 * The catalogue (PRD §21). Rewards follow §22's examples — a major subject quest
 * pays 500 (XP.questComplete), a topic quest a third of that.
 */
export const QUEST_TEMPLATES: readonly QuestTemplate[] = [
  {
    id: "topic",
    name: "Master a topic",
    blurb: "The five real activities, in order, for one topic.",
    needs: "topic",
    reward: 150,
  },
  {
    id: "subject",
    name: "Master a subject",
    blurb: "Read, study, quiz, pass — across every topic of a subject.",
    needs: "subject",
    reward: 500,
  },
  {
    id: "exam",
    name: "Exam prep",
    blurb: "A subject, a date, and a countdown that means it.",
    needs: "exam",
    reward: 300,
  },
  {
    id: "weekly",
    name: "A strong week",
    blurb: "A small recurring goal: a set number of study sessions.",
    needs: "none",
    reward: 150,
  },
  {
    id: "personal",
    name: "My own quest",
    blurb: "Your goal, your steps. The app just keeps count.",
    needs: "custom",
    reward: 200,
  },
];

export function templateFor(kind: QuestKind): QuestTemplate {
  const found = QUEST_TEMPLATES.find((t) => t.id === kind);
  if (!found) throw new Error(`unknown quest template: ${kind}`);
  return found;
}

export interface TemplateScope {
  topicName?: string;
  subjectName?: string;
  /** Weekly: how many sessions the quest asks for. */
  target?: number;
}

export interface TemplateStep {
  kind: QuestStepKind;
  title: string;
  refType: "topic" | "subject" | "week" | null;
}

/**
 * The steps a template resolves to. Titles name the scope so the stepper reads
 * like a plan ("Study Physics flashcards"), and every non-manual step carries the
 * refType whose id the server fills in at creation.
 */
export function templateSteps(kind: QuestKind, scope: TemplateScope): TemplateStep[] {
  const topic = scope.topicName ?? "this topic";
  const subject = scope.subjectName ?? "this subject";
  const target = scope.target ?? WEEKLY_SESSION_TARGET;

  switch (kind) {
    case "topic":
      return [
        { kind: "read_notes", title: "Read the notes", refType: "topic" },
        { kind: "review_summary", title: "Review a summary", refType: "topic" },
        { kind: "study_flashcards", title: "Study the flashcards", refType: "topic" },
        { kind: "complete_quiz", title: `Take the ${topic} quiz`, refType: "topic" },
        { kind: "final_challenge", title: `Pass the ${topic} challenge`, refType: "topic" },
      ];
    case "subject":
    case "exam":
      return [
        { kind: "read_notes", title: `Read the ${subject} notes`, refType: "subject" },
        { kind: "study_flashcards", title: `Study ${subject} flashcards`, refType: "subject" },
        { kind: "complete_quiz", title: `Take a ${subject} quiz`, refType: "subject" },
        { kind: "final_challenge", title: `Pass the ${subject} challenge`, refType: "subject" },
      ];
    case "weekly":
      return [
        {
          kind: "study_sessions",
          title: `Complete ${target} study sessions this week`,
          refType: "week",
        },
      ];
    case "personal":
      return [];
  }
}

export function templateTitle(kind: QuestKind, scope: TemplateScope): string {
  const subject = scope.subjectName ?? "this subject";
  const target = scope.target ?? WEEKLY_SESSION_TARGET;
  switch (kind) {
    case "topic":
      return `Master ${scope.topicName ?? "a topic"}`;
    case "subject":
      return `Master ${subject}`;
    case "exam":
      return `Prepare for ${subject}`;
    case "weekly":
      return `Complete ${target} study sessions`;
    case "personal":
      return "My quest";
  }
}

/* --- special-quest offers -------------------------------------------------- */

export interface OfferSubject {
  id: string;
  name: string;
  topicCount: number;
}

export interface OfferTopic {
  id: string;
  name: string;
  subjectId: string;
  subjectName: string;
  hasMaterial: boolean;
}

export interface OfferQuest {
  kind: string;
  scopeType: string | null;
  scopeId: string | null;
  status: string;
}

export interface QuestOffer {
  template: "subject" | "topic";
  scopeId: string;
  title: string;
  subtitle: string;
  reason: string;
}

export interface OfferInput {
  quests: readonly OfferQuest[];
  subjects: readonly OfferSubject[];
  topics: readonly OfferTopic[];
}

/**
 * At most one suggested quest, most likely first: a subject with real breadth and
 * no quest yet, else a topic that already has material. A scope the student
 * declined (or already quested) is never offered again — the "occasionally, never
 * spammed" rule of PRD §21 as a pure function.
 */
export function specialQuestOffer(input: OfferInput): QuestOffer | null {
  const taken = (kind: "subject" | "topic", scopeId: string) =>
    input.quests.some((q) => q.kind === kind && q.scopeId === scopeId);

  const subject = input.subjects.find((s) => s.topicCount >= 2 && !taken("subject", s.id));
  if (subject) {
    return {
      template: "subject",
      scopeId: subject.id,
      title: `Master ${subject.name}`,
      subtitle: `${subject.topicCount} topics, one goal`,
      reason: `You have been studying ${subject.name} in pieces — give it one quest.`,
    };
  }

  // A subject quest (active, completed or declined) speaks for its whole scope:
  // saying no to "Master Physics" must not be answered with "Master Motion" next
  // visit — declined and finished subjects silence the topic fallback inside them.
  const covered = (t: OfferTopic) =>
    input.quests.some((q) => q.kind === "subject" && q.scopeId === t.subjectId);

  const topic = input.topics.find((t) => t.hasMaterial && !taken("topic", t.id) && !covered(t));
  if (topic) {
    return {
      template: "topic",
      scopeId: topic.id,
      title: `Master ${topic.name}`,
      subtitle: `A full run through ${topic.subjectName}`,
      reason: `${topic.name} already has notes and practice — finish it properly.`,
    };
  }

  return null;
}

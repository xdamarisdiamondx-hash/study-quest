/**
 * Quests as one service (P13): templates resolve into rows here, every
 * completion moves step status, XP and the streak together, and the routers that
 * *do the work* (quizzes, flashcards) hook back in through `recordQuestSignal`
 * so PRD §20's stepper fills itself while the student studies.
 *
 * XP rules (PRD §22, A.8): the underlying activity keeps its own award; a step
 * pays `XP.questStep` once — ledger-keyed, so resetting a step gives it back —
 * and finishing a quest pays its template reward (500 for a subject quest, per
 * §22's example). One activity, its own reward, plus the quest's — never a
 * second award pretending to be the first.
 *
 * Ordering note: `signalMatch` completes a step whatever its display state says,
 * so work done "out of order" (quiz passed before the notes were read) counts —
 * the stepper's locks are presentation, not gates (A.8).
 */
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";

import { XP } from "@sq/core/gamification";
import {
  countProgress,
  countReachesTarget,
  isQuestComplete,
  questProgress,
  signalMatch,
  specialQuestOffer,
  stepStates,
  templateFor,
  templateSteps,
  templateTitle,
  WEEKLY_SESSION_TARGET,
  type QuestKind,
  type QuestOffer,
  type QuestProgress,
  type QuestStepKind,
  type QuestStepSnapshot,
  type SignalContext,
  type StepState,
} from "@sq/core/quests";
import type { CreateQuest, DeclineOffer } from "@sq/core/schemas/quests";
import { flashcards, notes, questSteps, quests, subjects, topics, quizzes } from "@sq/db/schema";

import { db } from "../db.ts";
import { awardXp, recordActivity, revokeXp } from "./xp.ts";

type QuestRow = typeof quests.$inferSelect;
type StepRow = typeof questSteps.$inferSelect;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

const xpStepSource = (userId: string, stepId: string) => ({
  userId,
  reason: "quest_step",
  sourceType: "step",
  sourceId: stepId,
});

const xpQuestSource = (userId: string, questId: string) => ({
  userId,
  reason: "quest_complete",
  sourceType: "quest",
  sourceId: questId,
});

/* --- read model ------------------------------------------------------------ */

export interface QuestStepView {
  id: string;
  title: string;
  kind: string;
  orderIndex: number;
  status: "pending" | "done";
  state: StepState;
  target: number;
  progress: number;
  refType: string | null;
  refId: string | null;
  /** Where "Continue" navigates: the step's subject, when it has one. */
  subjectId: string | null;
}

export interface QuestView {
  id: string;
  title: string;
  kind: string;
  xpReward: number;
  status: string;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  steps: QuestStepView[];
  progress: QuestProgress;
  /** Present when the quest counts something ("2/5 sessions"). */
  count: { progress: number; target: number } | null;
}

function toSnapshot(row: StepRow): QuestStepSnapshot {
  return {
    id: row.id,
    orderIndex: row.orderIndex,
    kind: row.kind as QuestStepKind,
    required: row.required,
    status: row.status as "pending" | "done",
    target: row.target,
    progress: row.progress,
    refType: row.refType,
    refId: row.refId,
  };
}

/**
 * topic-step ids → their subject, so a step can deep-link straight to
 * `/study/:subjectId/...`. Unknown (deleted) topics simply resolve to null and
 * the UI disables the link instead of pointing at a dead page.
 */
async function topicSubjectMap(
  profileId: string,
  topicIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(topicIds)];
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = await db.orm
    .select({ topicId: topics.id, subjectId: subjects.id })
    .from(topics)
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .where(and(eq(subjects.userId, profileId), inArray(topics.id, ids)));
  for (const r of rows) out.set(r.topicId, r.subjectId);
  return out;
}

function buildViews(
  questRows: readonly QuestRow[],
  stepRows: readonly StepRow[],
  topicSubject: Map<string, string>,
): QuestView[] {
  return questRows.map((q) => {
    const own = stepRows.filter((s) => s.questId === q.id);
    const snapshots = own.map(toSnapshot);
    const states = stepStates(snapshots);
    const steps: QuestStepView[] = own.map((row, i) => ({
      id: row.id,
      title: row.title,
      kind: row.kind,
      orderIndex: row.orderIndex,
      status: row.status as "pending" | "done",
      state: states[i] ?? "current",
      target: row.target,
      progress: row.progress,
      refType: row.refType,
      refId: row.refId,
      subjectId:
        row.refType === "topic"
          ? row.refId
            ? (topicSubject.get(row.refId) ?? null)
            : null
          : row.refType === "subject"
            ? row.refId
            : null,
    }));
    return {
      id: q.id,
      title: q.title,
      kind: q.kind,
      xpReward: q.xpReward,
      status: q.status,
      dueAt: iso(q.dueAt),
      startedAt: iso(q.startedAt),
      completedAt: iso(q.completedAt),
      steps,
      progress: questProgress(snapshots),
      count: countProgress(snapshots),
    };
  });
}

/** Active and completed quests, newest first, with their steps and states. */
export async function listQuests(
  profileId: string,
): Promise<{ active: QuestView[]; completed: QuestView[] }> {
  const questRows = await db.orm
    .select()
    .from(quests)
    .where(and(eq(quests.userId, profileId), inArray(quests.status, ["active", "completed"])))
    .orderBy(desc(quests.startedAt));
  if (questRows.length === 0) return { active: [], completed: [] };

  const stepRows = await db.orm
    .select()
    .from(questSteps)
    .where(
      inArray(
        questSteps.questId,
        questRows.map((q) => q.id),
      ),
    )
    .orderBy(asc(questSteps.orderIndex));

  const map = await topicSubjectMap(
    profileId,
    stepRows.flatMap((s) => (s.refType === "topic" && s.refId ? [s.refId] : [])),
  );
  const views = buildViews(questRows, stepRows, map);
  return {
    active: views.filter((v) => v.status === "active"),
    completed: views.filter((v) => v.status === "completed"),
  };
}

/** One quest's view — the shape every step action returns so the card can re-render. */
export async function questView(profileId: string, questId: string): Promise<QuestView | null> {
  const [q] = await db.orm
    .select()
    .from(quests)
    .where(and(eq(quests.id, questId), eq(quests.userId, profileId)))
    .limit(1);
  if (!q) return null;
  const stepRows = await db.orm
    .select()
    .from(questSteps)
    .where(eq(questSteps.questId, q.id))
    .orderBy(asc(questSteps.orderIndex));
  const map = await topicSubjectMap(
    profileId,
    stepRows.flatMap((s) => (s.refType === "topic" && s.refId ? [s.refId] : [])),
  );
  return buildViews([q], stepRows, map)[0] ?? null;
}

/* --- offers ---------------------------------------------------------------- */

/**
 * The one suggested quest for this student (PRD §21: occasional, never spammed).
 * Runs the pure offer rule over a snapshot of their subjects, material and
 * existing quests — declined and finished scopes are invisible to it.
 */
export async function questOffer(profileId: string): Promise<QuestOffer | null> {
  const subjectRows = await db.orm
    .select({ id: subjects.id, name: subjects.name })
    .from(subjects)
    .where(eq(subjects.userId, profileId))
    .orderBy(asc(subjects.orderIndex));

  const topicRows = await db.orm
    .select({ id: topics.id, name: topics.name, subjectId: topics.subjectId })
    .from(topics)
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .where(eq(subjects.userId, profileId));
  if (topicRows.length === 0 && subjectRows.length === 0) return null;

  const topicIds = topicRows.map((t) => t.id);
  const scoped = topicIds.length > 0;
  const noteRows = scoped
    ? await db.orm
        .select({ topicId: notes.topicId, n: count() })
        .from(notes)
        .where(and(eq(notes.userId, profileId), inArray(notes.topicId, topicIds)))
        .groupBy(notes.topicId)
    : [];
  const quizRows = scoped
    ? await db.orm
        .select({ topicId: quizzes.topicId, n: count() })
        .from(quizzes)
        .where(and(eq(quizzes.userId, profileId), inArray(quizzes.topicId, topicIds)))
        .groupBy(quizzes.topicId)
    : [];
  // flashcards carry no userId — scoping by the caller's topic ids is the
  // ownership rule used everywhere else for cards (P12 read model).
  const cardRows = scoped
    ? await db.orm
        .select({ topicId: flashcards.topicId })
        .from(flashcards)
        .where(inArray(flashcards.topicId, topicIds))
        .groupBy(flashcards.topicId)
    : [];

  const withMaterial = new Set([
    ...noteRows.map((r) => r.topicId),
    ...quizRows.map((r) => r.topicId),
    ...cardRows.map((r) => r.topicId),
  ]);

  const subjectName = new Map(subjectRows.map((s) => [s.id, s.name]));
  const questRows = await db.orm
    .select({
      kind: quests.kind,
      scopeType: quests.scopeType,
      scopeId: quests.scopeId,
      status: quests.status,
    })
    .from(quests)
    .where(eq(quests.userId, profileId));

  const topicCount = new Map<string, number>();
  for (const t of topicRows) topicCount.set(t.subjectId, (topicCount.get(t.subjectId) ?? 0) + 1);

  return specialQuestOffer({
    quests: questRows,
    subjects: subjectRows.map((s) => ({
      id: s.id,
      name: s.name,
      topicCount: topicCount.get(s.id) ?? 0,
    })),
    topics: topicRows
      .filter((t) => withMaterial.has(t.id))
      .map((t) => ({
        id: t.id,
        name: t.name,
        subjectId: t.subjectId,
        subjectName: subjectName.get(t.subjectId) ?? "this subject",
        hasMaterial: true,
      })),
  });
}

/* --- creation -------------------------------------------------------------- */

/** What one step needs to become a row: the engine's title and ref shape. */
type StepDraft = {
  kind: QuestStepKind;
  title: string;
  refType: "topic" | "subject" | "week" | null;
};

/**
 * Create a quest from a template: the *server* resolves steps from
 * `templateSteps`, so titles, order and ref types can never drift from the
 * engine's catalogue — the client only names the template and its scope.
 */
export async function createQuest(
  profileId: string,
  input: CreateQuest,
): Promise<QuestView | null> {
  const kind = input.template as QuestKind;
  let scopeType: string | null = kind;
  let scopeId: string | null = null;
  let dueAt: Date | null = null;
  let topicName: string | undefined;
  let subjectName: string | undefined;
  let refIdForSteps: string | null = null;
  let target = WEEKLY_SESSION_TARGET;
  let drafts: StepDraft[];

  if (kind === "topic") {
    const rows = await db.orm
      .select({
        topicId: topics.id,
        topicName: topics.name,
        subjectId: subjects.id,
        subjectName: subjects.name,
      })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .where(and(eq(topics.id, input.topicId ?? ""), eq(subjects.userId, profileId)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    scopeId = row.topicId;
    topicName = row.topicName;
    subjectName = row.subjectName;
    refIdForSteps = row.topicId;
    drafts = templateSteps("topic", { topicName });
  } else if (kind === "subject" || kind === "exam") {
    const rows = await db.orm
      .select()
      .from(subjects)
      .where(and(eq(subjects.id, input.subjectId ?? ""), eq(subjects.userId, profileId)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    scopeId = row.id;
    subjectName = row.name;
    refIdForSteps = row.id;
    // The exam's date lives on the quest, not its steps: the countdown is the point.
    if (kind === "exam") dueAt = new Date(`${input.examDate}T23:59:59`);
    drafts = templateSteps(kind, { subjectName });
  } else if (kind === "weekly") {
    scopeType = "week";
    target = input.target ?? WEEKLY_SESSION_TARGET;
    drafts = templateSteps("weekly", { target });
  } else {
    // Personal: the student authors the steps; the app keeps count.
    scopeType = null;
    drafts = (input.steps ?? []).map((s) => ({
      kind: "manual" as QuestStepKind,
      title: s.title,
      refType: null,
    }));
  }

  const template = templateFor(kind);
  const title = input.title ?? templateTitle(kind, { topicName, subjectName, target });

  const [quest] = await db.orm
    .insert(quests)
    .values({
      userId: profileId,
      title,
      kind,
      scopeType,
      scopeId,
      xpReward: template.reward,
      status: "active",
      dueAt,
      startedAt: new Date(),
    })
    .returning();
  if (!quest) return null;

  if (drafts.length > 0) {
    await db.orm.insert(questSteps).values(
      drafts.map((d, i) => ({
        questId: quest.id,
        orderIndex: i,
        title: d.title,
        kind: d.kind,
        refType: d.refType,
        refId: d.refType === "topic" || d.refType === "subject" ? refIdForSteps : null,
        target: d.kind === "study_sessions" ? target : 1,
      })),
    );
  }

  return questView(profileId, quest.id);
}

/** Declining an offer stores a declined row — the offer rule reads it as "asked, said no". */
export async function declineOffer(profileId: string, input: DeclineOffer): Promise<void> {
  await db.orm.insert(quests).values({
    userId: profileId,
    title: input.title,
    kind: input.template,
    scopeType: input.template,
    scopeId: input.scopeId,
    xpReward: 0,
    status: "declined",
  });
}

/** Abandon an active quest. Completed quests are history and are not deletable here. */
export async function abandonQuest(profileId: string, questId: string): Promise<boolean> {
  const rows = await db.orm
    .delete(quests)
    .where(and(eq(quests.id, questId), eq(quests.userId, profileId), eq(quests.status, "active")))
    .returning({ id: quests.id });
  return rows.length > 0;
}

/* --- completion ------------------------------------------------------------ */

export interface StepActionResult {
  quest: QuestView;
  /** True only when *this* call finished the quest (the celebration trigger). */
  questCompleted: boolean;
  xpAwarded: number;
  questXp: number;
}

async function stepAndQuest(profileId: string, stepId: string) {
  const rows = await db.orm
    .select({ step: questSteps, quest: quests })
    .from(questSteps)
    .innerJoin(quests, eq(questSteps.questId, quests.id))
    .where(and(eq(questSteps.id, stepId), eq(quests.userId, profileId)))
    .limit(1);
  return rows[0] ?? null;
}

async function questStepsOf(questId: string): Promise<StepRow[]> {
  return db.orm
    .select()
    .from(questSteps)
    .where(eq(questSteps.questId, questId))
    .orderBy(asc(questSteps.orderIndex));
}

/**
 * Finish a quest if every required step is now done: status, XP reward and a
 * streak day move together. Returns the flip, so the caller celebrates exactly
 * once — a quest completed by a later signal than the step's own action doesn't
 * claim credit twice.
 */
async function maybeCompleteQuest(
  profileId: string,
  quest: QuestRow,
): Promise<{ completed: boolean; xp: number }> {
  if (quest.status !== "active") return { completed: false, xp: 0 };
  const steps = await questStepsOf(quest.id);
  const snapshots = steps.map(toSnapshot);
  if (!isQuestComplete(snapshots)) return { completed: false, xp: 0 };

  await db.orm
    .update(quests)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(quests.id, quest.id));
  const xp = await awardXp({
    delta: quest.xpReward,
    ...xpQuestSource(profileId, quest.id),
  });
  await recordActivity(profileId);
  return { completed: true, xp };
}

/**
 * Mark one step done manually — the fallback that keeps principle 4 true for
 * steps whose activity has no server event ("read the notes" on paper, a
 * discussion that happened offline).
 */
export async function completeStep(
  profileId: string,
  stepId: string,
): Promise<StepActionResult | null> {
  const found = await stepAndQuest(profileId, stepId);
  if (!found) return null;
  const { step, quest } = found;

  const noop: StepActionResult = {
    quest: (await questView(profileId, quest.id))!,
    questCompleted: false,
    xpAwarded: 0,
    questXp: 0,
  };
  if (quest.status !== "active" || step.status === "done") return noop;

  await db.orm
    .update(questSteps)
    .set({ status: "done", completedAt: new Date(), progress: step.target })
    .where(eq(questSteps.id, step.id));
  const xpAwarded = await awardXp({ delta: XP.questStep, ...xpStepSource(profileId, step.id) });
  await recordActivity(profileId);

  const done = await maybeCompleteQuest(profileId, quest);
  return {
    quest: (await questView(profileId, quest.id))!,
    questCompleted: done.completed,
    xpAwarded,
    questXp: done.xp,
  };
}

/**
 * Take a step back (and the quest with it): step XP returns, and a quest that
 * was completed only because of this step reopens with its reward revoked.
 * Streak days are never unticked — the day genuinely had activity in it.
 */
export async function resetStep(
  profileId: string,
  stepId: string,
): Promise<{ quest: QuestView } | null> {
  const found = await stepAndQuest(profileId, stepId);
  if (!found) return null;
  const { step, quest } = found;
  if (step.status === "pending") {
    const view = await questView(profileId, quest.id);
    return view ? { quest: view } : null;
  }

  await db.orm
    .update(questSteps)
    .set({ status: "pending", completedAt: null, progress: 0 })
    .where(eq(questSteps.id, step.id));
  await revokeXp(xpStepSource(profileId, step.id));

  const steps = (await questStepsOf(quest.id)).map(toSnapshot);
  if (quest.status === "completed" && !isQuestComplete(steps)) {
    await db.orm
      .update(quests)
      .set({ status: "active", completedAt: null })
      .where(eq(quests.id, quest.id));
    await revokeXp(xpQuestSource(profileId, quest.id));
  }

  const view = await questView(profileId, quest.id);
  return view ? { quest: view } : null;
}

/* --- signals --------------------------------------------------------------- */

export interface QuestSignalOutcome {
  stepsCompleted: number;
  questsCompleted: { id: string; title: string; xp: number }[];
  xpAwarded: number;
}

export const emptyOutcome = (): QuestSignalOutcome => ({
  stepsCompleted: 0,
  questsCompleted: [],
  xpAwarded: 0,
});

/**
 * The hook every success path calls: a quiz graded, a batch of cards rated, the
 * student opening the notes or receiving a summary. Matching happens in the pure
 * engine (`signalMatch`); this function only resolves topic→subject scope, writes
 * the rows and pays the ledger. Safe to call always — with no quest listening,
 * it reads two tables and returns an empty outcome.
 */
export async function recordQuestSignal(
  profileId: string,
  ctx: SignalContext,
): Promise<QuestSignalOutcome> {
  const outcome = emptyOutcome();

  let subjectIds = [...ctx.subjectIds];
  if (subjectIds.length === 0 && ctx.topicIds.length > 0) {
    subjectIds = [...(await topicSubjectMap(profileId, ctx.topicIds)).values()];
  }
  const full: SignalContext = { ...ctx, subjectIds: [...new Set(subjectIds)] };

  const active = await db.orm
    .select()
    .from(quests)
    .where(and(eq(quests.userId, profileId), eq(quests.status, "active")));
  if (active.length === 0) return outcome;

  const pending = await db.orm
    .select()
    .from(questSteps)
    .where(
      and(
        inArray(
          questSteps.questId,
          active.map((q) => q.id),
        ),
        eq(questSteps.status, "pending"),
      ),
    );
  if (pending.length === 0) return outcome;

  const touched = new Set<string>();
  for (const row of pending) {
    const match = signalMatch(toSnapshot(row), full);
    if (match === "none") continue;
    touched.add(row.questId);

    if (match === "count") {
      const next = Math.min(row.target, row.progress + 1);
      const reached = countReachesTarget(next, row.target);
      await db.orm
        .update(questSteps)
        .set(
          reached
            ? { progress: next, status: "done", completedAt: new Date() }
            : { progress: next },
        )
        .where(eq(questSteps.id, row.id));
      if (reached) {
        outcome.stepsCompleted += 1;
        outcome.xpAwarded += await awardXp({
          delta: XP.questStep,
          ...xpStepSource(profileId, row.id),
        });
        await recordActivity(profileId);
      }
      continue;
    }

    await db.orm
      .update(questSteps)
      .set({ status: "done", completedAt: new Date(), progress: row.target })
      .where(eq(questSteps.id, row.id));
    outcome.stepsCompleted += 1;
    outcome.xpAwarded += await awardXp({
      delta: XP.questStep,
      ...xpStepSource(profileId, row.id),
    });
    await recordActivity(profileId);
  }

  for (const quest of active) {
    if (!touched.has(quest.id)) continue;
    const done = await maybeCompleteQuest(profileId, quest);
    if (done.completed)
      outcome.questsCompleted.push({ id: quest.id, title: quest.title, xp: done.xp });
  }

  return outcome;
}

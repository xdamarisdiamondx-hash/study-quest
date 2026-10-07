/**
 * Study sessions (P14, PRD §26): one active session at a time, a guided journey
 * assembled from the topic's real material, and the completion summary — XP,
 * streak, quest outcome and one suggested next action.
 *
 * The clock lives with the client (rendered from timestamps), but the *log* is
 * server truth: wall time comes from this machine's `startedAt`/`endedAt`, and
 * only the pause is reported by the screen that caused it. Finishing a session
 * is real work in three systems at once — the XP ledger (idempotent), the
 * streak (`recordActivity`) and the weekly quest's session counter
 * (`recordQuestSignal` type "session").
 */
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { XP, type StreakState } from "@sq/core/gamification";
import { focusMinutes, guidedSteps, nextAction } from "@sq/core/sessions";
import type { CreateSession } from "@sq/core/schemas/sessions";
import * as dbSchema from "@sq/db/schema";

import { db } from "../db.ts";
import { recordQuestSignal, type QuestSignalOutcome } from "./quests.ts";
import { awardXp, recordActivity } from "./xp.ts";

const { studySessions, sessionSteps, subjects, topics, tasks, notes, quizzes, flashcards } =
  dbSchema;

export interface SessionStepView {
  id: string;
  orderIndex: number;
  kind: string;
  title: string;
  refType: string | null;
  refId: string | null;
  status: "pending" | "done";
}

export interface SessionView {
  id: string;
  mode: string;
  status: string;
  subjectId: string | null;
  subjectName: string | null;
  topicId: string | null;
  topicName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  plannedMin: number;
  focusMin: number;
  /** Epoch ms — the timer's start, the one truth the client renders from. */
  startedAt: number;
  endedAt: number | null;
  steps: SessionStepView[];
}

export interface SessionSummary {
  session: SessionView;
  /** XP the ledger now holds for this session (idempotent on a retry). */
  xp: number;
  streak: StreakState;
  quest: QuestSignalOutcome;
  /** The completion card's one suggestion — null when nothing is scoped. */
  next: string | null;
}

function toStepView(row: typeof sessionSteps.$inferSelect): SessionStepView {
  return {
    id: row.id,
    orderIndex: row.orderIndex,
    kind: row.kind,
    title: row.title ?? row.kind,
    refType: row.refType,
    refId: row.refId,
    status: row.status === "done" ? "done" : "pending",
  };
}

async function stepsOf(sessionId: string): Promise<SessionStepView[]> {
  const rows = await db.orm
    .select()
    .from(sessionSteps)
    .where(eq(sessionSteps.sessionId, sessionId))
    .orderBy(asc(sessionSteps.orderIndex));
  return rows.map(toStepView);
}

type SessionRow = typeof studySessions.$inferSelect;

async function toView(
  row: SessionRow,
  names: { subjectName?: string | null; topicName?: string | null; taskTitle?: string | null } = {},
): Promise<SessionView> {
  let subjectName = names.subjectName ?? null;
  let topicName = names.topicName ?? null;
  let taskTitle = names.taskTitle ?? null;

  if (row.subjectId && subjectName === null) {
    const [s] = await db.orm.select().from(subjects).where(eq(subjects.id, row.subjectId)).limit(1);
    subjectName = s?.name ?? null;
  }
  if (row.topicId && topicName === null) {
    const [t] = await db.orm.select().from(topics).where(eq(topics.id, row.topicId)).limit(1);
    topicName = t?.name ?? null;
  }
  if (row.taskId && taskTitle === null) {
    const [t] = await db.orm.select().from(tasks).where(eq(tasks.id, row.taskId)).limit(1);
    taskTitle = t?.title ?? null;
  }

  return {
    id: row.id,
    mode: row.mode,
    status: row.status,
    subjectId: row.subjectId,
    subjectName,
    topicId: row.topicId,
    topicName,
    taskId: row.taskId,
    taskTitle,
    plannedMin: row.plannedMin,
    focusMin: row.focusMin,
    startedAt: row.startedAt.getTime(),
    endedAt: row.endedAt ? row.endedAt.getTime() : null,
    steps: await stepsOf(row.id),
  };
}

/* --- scope resolution ------------------------------------------------------ */

interface Scope {
  subjectId: string | null;
  topicId: string | null;
  taskId: string | null;
}

/**
 * Resolve and *validate* the scope in one pass: a topic supplies its subject,
 * a task supplies whatever it is filed under, and anything the caller names
 * must belong to them — a null result reads as not_found, same as a missing row.
 */
async function resolveScope(profileId: string, input: CreateSession): Promise<Scope | null> {
  const scope: Scope = {
    subjectId: input.subjectId ?? null,
    topicId: input.topicId ?? null,
    taskId: input.taskId ?? null,
  };

  if (scope.topicId) {
    const [row] = await db.orm
      .select({ id: topics.id, subjectId: topics.subjectId })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .where(and(eq(topics.id, scope.topicId), eq(subjects.userId, profileId)))
      .limit(1);
    if (!row) return null;
    // The topic's own subject wins: the two can never disagree.
    scope.subjectId = row.subjectId;
  }

  if (scope.subjectId && !scope.topicId) {
    const [row] = await db.orm
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.id, scope.subjectId), eq(subjects.userId, profileId)))
      .limit(1);
    if (!row) return null;
  }

  if (scope.taskId) {
    const [row] = await db.orm
      .select({ id: tasks.id, subjectId: tasks.subjectId, topicId: tasks.topicId })
      .from(tasks)
      .where(and(eq(tasks.id, scope.taskId), eq(tasks.userId, profileId)))
      .limit(1);
    if (!row) return null;
    if (!scope.subjectId) scope.subjectId = row.subjectId;
    if (!scope.topicId) scope.topicId = row.topicId;
  }

  return scope;
}

/** The material the guided journey names: first note, first deck, newest quiz. */
async function guidedSource(topicId: string, topicName: string) {
  const [note] = await db.orm
    .select({ title: notes.title })
    .from(notes)
    .where(eq(notes.topicId, topicId))
    .orderBy(desc(notes.updatedAt))
    .limit(1);
  const [deck] = await db.orm
    .select({ title: dbSchema.flashcardDecks.title })
    .from(dbSchema.flashcardDecks)
    .where(eq(dbSchema.flashcardDecks.topicId, topicId))
    .orderBy(desc(dbSchema.flashcardDecks.createdAt))
    .limit(1);
  const [quiz] = await db.orm
    .select({ title: quizzes.title })
    .from(quizzes)
    .where(eq(quizzes.topicId, topicId))
    .orderBy(desc(quizzes.createdAt))
    .limit(1);

  return {
    topicId,
    topicName,
    noteTitle: note?.title ?? null,
    deckTitle: deck?.title ?? null,
    quizTitle: quiz?.title ?? null,
  };
}

/* --- lifecycle ------------------------------------------------------------- */

export async function activeSession(profileId: string): Promise<SessionView | null> {
  const [row] = await db.orm
    .select()
    .from(studySessions)
    .where(and(eq(studySessions.userId, profileId), eq(studySessions.status, "active")))
    .orderBy(desc(studySessions.startedAt))
    .limit(1);
  return row ? toView(row) : null;
}

/** The picker's read: the running session (if any) plus the log behind it. */
export async function listSessions(
  profileId: string,
): Promise<{ active: SessionView | null; recent: SessionView[] }> {
  const rows = await db.orm
    .select()
    .from(studySessions)
    .where(eq(studySessions.userId, profileId))
    .orderBy(desc(studySessions.startedAt))
    .limit(20);
  const activeRow = rows.find((r) => r.status === "active") ?? null;
  const recent = rows.filter((r) => r.status !== "active").slice(0, 10);
  return {
    active: activeRow ? await toView(activeRow) : null,
    recent: await Promise.all(recent.map((r) => toView(r))),
  };
}

/**
 * Start a session. One active session at a time is a server rule, not a UI
 * convention: a second start while one runs answers `already_active` with the
 * session in flight, so the client shows it instead of forking the clock.
 */
export async function startSession(
  profileId: string,
  input: CreateSession,
): Promise<{ session: SessionView } | { alreadyActive: SessionView } | null> {
  const existing = await activeSession(profileId);
  if (existing) return { alreadyActive: existing };

  const scope = await resolveScope(profileId, input);
  if (!scope) return null;

  const plannedMin = input.plannedMin ?? (input.mode === "focus" ? 25 : 0);

  const [row] = await db.orm
    .insert(studySessions)
    .values({
      userId: profileId,
      subjectId: scope.subjectId,
      topicId: scope.topicId,
      taskId: scope.taskId,
      mode: input.mode,
      plannedMin,
      status: "active",
      startedAt: new Date(),
    })
    .returning();
  if (!row) return null;

  if (input.mode === "guided" && scope.topicId) {
    const [topic] = await db.orm
      .select({ name: topics.name })
      .from(topics)
      .where(eq(topics.id, scope.topicId))
      .limit(1);
    const drafts = guidedSteps(await guidedSource(scope.topicId, topic?.name ?? "this topic"));
    await db.orm.insert(sessionSteps).values(
      drafts.map((d, i) => ({
        sessionId: row.id,
        orderIndex: i,
        kind: d.kind,
        title: d.title,
        refType: d.refType,
        refId: d.refId,
      })),
    );
  }

  return { session: await toView(row) };
}

/** Mark one guided stage done (or back to pending) as the student runs it. */
export async function setSessionStep(
  profileId: string,
  sessionId: string,
  stepId: string,
  status: "done" | "pending",
): Promise<SessionView | null> {
  const [session] = await db.orm
    .select()
    .from(studySessions)
    .where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, profileId)))
    .limit(1);
  if (!session) return null;
  if (session.status !== "active") return toView(session);

  await db.orm
    .update(sessionSteps)
    .set(
      status === "done"
        ? { status: "done", completedAt: new Date() }
        : { status: "pending", completedAt: null },
    )
    .where(and(eq(sessionSteps.id, stepId), eq(sessionSteps.sessionId, sessionId)));

  return toView(session);
}

/**
 * Finish the session: log the minutes, pay XP, move the streak, count the
 * weekly quest — then answer with everything the summary card shows.
 */
export async function endSession(
  profileId: string,
  sessionId: string,
  pausedMin: number,
): Promise<SessionSummary | null> {
  const [session] = await db.orm
    .select()
    .from(studySessions)
    .where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, profileId)))
    .limit(1);
  if (!session || session.status !== "active") return null;

  const endedAt = new Date();
  const minutes = focusMinutes(endedAt.getTime() - session.startedAt.getTime(), pausedMin);
  const [row] = await db.orm
    .update(studySessions)
    .set({ status: "completed", endedAt, focusMin: minutes })
    .where(eq(studySessions.id, session.id))
    .returning();
  if (!row) return null;

  if (session.topicId) {
    await db.orm
      .update(topics)
      .set({ lastStudiedAt: endedAt })
      .where(eq(topics.id, session.topicId));
  }

  const xp = await awardXp({
    delta: XP.session,
    userId: profileId,
    reason: "session",
    sourceType: "session",
    sourceId: session.id,
  });
  const streak = await recordActivity(profileId, endedAt);
  const quest = await recordQuestSignal(profileId, {
    type: "session",
    topicIds: session.topicId ? [session.topicId] : [],
    subjectIds: session.subjectId ? [session.subjectId] : [],
  });

  return {
    session: await toView(row),
    xp,
    streak,
    quest,
    next: await suggestionFor(session),
  };
}

/** One suggestion for the summary card, from what the topic actually has. */
async function suggestionFor(session: SessionRow): Promise<string | null> {
  if (!session.topicId) return null;
  const [topic] = await db.orm
    .select({ name: topics.name })
    .from(topics)
    .where(eq(topics.id, session.topicId))
    .limit(1);
  if (!topic) return null;

  const now = new Date();
  const [due] = await db.orm
    .select({ n: sql<number>`count(*)::int` })
    .from(flashcards)
    .where(
      and(
        eq(flashcards.topicId, session.topicId),
        or(isNull(flashcards.dueAt), lte(flashcards.dueAt, now)),
      ),
    );
  const [noteCount] = await db.orm
    .select({ n: sql<number>`count(*)::int` })
    .from(notes)
    .where(eq(notes.topicId, session.topicId));
  const [quizCount] = await db.orm
    .select({ n: sql<number>`count(*)::int` })
    .from(quizzes)
    .where(eq(quizzes.topicId, session.topicId));

  return nextAction({
    topicName: topic.name,
    dueCards: due?.n ?? 0,
    hasNotes: (noteCount?.n ?? 0) > 0,
    hasQuiz: (quizCount?.n ?? 0) > 0,
  });
}

/** Minutes studied per topic — the progress formula's session input (§18.3). */
export async function sessionMinutesByTopic(
  profileId: string,
  topicIds: string[],
): Promise<Map<string, number>> {
  if (topicIds.length === 0) return new Map();
  const rows = await db.orm
    .select({
      topicId: studySessions.topicId,
      minutes: sql<number>`coalesce(sum(${studySessions.focusMin}), 0)::int`,
    })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.userId, profileId),
        inArray(studySessions.topicId, topicIds),
        eq(studySessions.status, "completed"),
      ),
    )
    .groupBy(studySessions.topicId);
  return new Map(rows.filter((r) => r.topicId).map((r) => [r.topicId as string, r.minutes]));
}

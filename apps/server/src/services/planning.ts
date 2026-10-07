/**
 * Planning's read model (P12): the snapshots the pure engine in `@sq/core/planning`
 * works over, assembled here once and reused by the plan router and the tasks router's
 * suggestion endpoint.
 *
 * All queries are profile-scoped through `requireProfile`'s id; topics are scoped by
 * joining subjects, which is what makes "this topic belongs to the caller" true
 * everywhere else in the app too.
 */
import { and, avg, count, eq, inArray, sql } from "drizzle-orm";

import type { TaskSnapshot, TopicSnapshot } from "@sq/core/planning";
import {
  flashcards,
  notes,
  questionMastery,
  quizzes,
  subjects,
  tasks,
  topics,
} from "@sq/db/schema";

import { db } from "../db.ts";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** One row as the engine sees it — shared by list reads and the per-task endpoint. */
export function toTaskSnapshot(row: typeof tasks.$inferSelect): TaskSnapshot {
  return {
    id: row.id,
    title: row.title,
    subjectId: row.subjectId,
    topicId: row.topicId,
    kind: row.kind,
    priority: row.priority,
    dueAt: iso(row.dueAt),
    estimateMin: row.estimateMin ?? 0,
  };
}

/** Open tasks as the engine sees them. Materialisation runs before this on list reads. */
export async function openTaskSnapshots(profileId: string): Promise<TaskSnapshot[]> {
  const rows = await db.orm
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, profileId), eq(tasks.status, "open")));
  return rows.map(toTaskSnapshot);
}

/**
 * Topic snapshots: identity from topics⋈subjects, mastery as the attempt-weighted
 * average across concepts, and material counts (notes, cards, due cards, quizzes).
 * Unknown ids are simply absent — the engine treats that like a topic with nothing.
 */
export async function topicSnapshots(
  profileId: string,
  topicIds: readonly string[],
  now = new Date(),
): Promise<Map<string, TopicSnapshot>> {
  const ids = [...new Set(topicIds)];
  const out = new Map<string, TopicSnapshot>();
  if (ids.length === 0) return out;

  const rows = await db.orm
    .select({
      id: topics.id,
      subjectId: topics.subjectId,
      name: topics.name,
      status: topics.status,
      lastStudiedAt: topics.lastStudiedAt,
    })
    .from(topics)
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .where(and(eq(subjects.userId, profileId), inArray(topics.id, ids)));

  const masteryRows = await db.orm
    .select({ topicId: questionMastery.topicId, m: avg(questionMastery.mastery) })
    .from(questionMastery)
    .where(and(eq(questionMastery.userId, profileId), inArray(questionMastery.topicId, ids)))
    .groupBy(questionMastery.topicId);

  const noteRows = await db.orm
    .select({ topicId: notes.topicId, n: count() })
    .from(notes)
    .where(and(eq(notes.userId, profileId), inArray(notes.topicId, ids)))
    .groupBy(notes.topicId);

  const quizRows = await db.orm
    .select({ topicId: quizzes.topicId, n: count() })
    .from(quizzes)
    .where(and(eq(quizzes.userId, profileId), inArray(quizzes.topicId, ids)))
    .groupBy(quizzes.topicId);

  // Due = waiting to be reviewed: never seen, or seen and due by now (flashcards route rule).
  const cardRows = await db.orm
    .select({
      topicId: flashcards.topicId,
      cards: count(),
      due: sql<number>`count(*) filter (where ${flashcards.dueAt} is null or ${flashcards.dueAt} <= ${now})`,
    })
    .from(flashcards)
    .where(inArray(flashcards.topicId, ids))
    .groupBy(flashcards.topicId);

  const mastery = new Map(masteryRows.map((r) => [r.topicId, r.m === null ? null : Number(r.m)]));
  const noteCount = new Map(noteRows.map((r) => [r.topicId, r.n]));
  const quizCount = new Map(quizRows.map((r) => [r.topicId, r.n]));
  const cardCount = new Map(cardRows.map((r) => [r.topicId, { cards: r.cards, due: r.due }]));

  for (const r of rows) {
    const cards = cardCount.get(r.id);
    out.set(r.id, {
      id: r.id,
      subjectId: r.subjectId,
      name: r.name,
      status: r.status,
      lastStudiedAt: iso(r.lastStudiedAt),
      mastery: mastery.get(r.id) ?? null,
      assets: {
        notes: noteCount.get(r.id) ?? 0,
        cards: cards?.cards ?? 0,
        dueCards: cards?.due ?? 0,
        quizzes: quizCount.get(r.id) ?? 0,
      },
    });
  }
  return out;
}

/** Every topic id the caller owns — automatic mode fills from this pool. */
export async function ownedTopicIds(profileId: string): Promise<string[]> {
  const rows = await db.orm
    .select({ id: topics.id })
    .from(topics)
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .where(eq(subjects.userId, profileId));
  return rows.map((r) => r.id);
}

/** Subject names for grouping the quest and labelling blocks. */
export async function subjectNames(profileId: string): Promise<Map<string, string>> {
  const rows = await db.orm
    .select({ id: subjects.id, name: subjects.name })
    .from(subjects)
    .where(eq(subjects.userId, profileId));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Is this task the caller's? Used before anything points a block at it. */
export async function ownsTask(profileId: string, taskId: string): Promise<boolean> {
  const row = await db.orm
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, profileId)))
    .limit(1);
  return row.length > 0;
}

/** Topics are scoped through their subject's owner — same rule as the tasks router. */
export async function ownsTopic(profileId: string, topicId: string): Promise<boolean> {
  const row = await db.orm
    .select({ id: topics.id })
    .from(topics)
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .where(and(eq(topics.id, topicId), eq(subjects.userId, profileId)))
    .limit(1);
  return row.length > 0;
}

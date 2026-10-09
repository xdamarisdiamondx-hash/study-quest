import { asc, count, eq } from "drizzle-orm";
import { Hono } from "hono";

import { STARTER_SUBJECTS, monogramFor, type StarterExample } from "@sq/core/starter";
import * as dbSchema from "@sq/db/schema";

import type { AuthedEnv } from "../auth/session.ts";
import { getSession } from "../auth/session.ts";
import { db } from "../db.ts";
import { createQuest } from "../services/quests.ts";

const {
  users,
  subjects,
  topics,
  streaks,
  quests,
  notes,
  quizzes,
  quizQuestions,
  flashcardDecks,
  flashcards,
} = dbSchema;

export const onboarding = new Hono<AuthedEnv>();

async function profileFor(authUserId: string) {
  const [profile] = await db.orm
    .select()
    .from(users)
    .where(eq(users.authUserId, authUserId))
    .limit(1);
  return profile ?? null;
}

/** Templates offered by the picker: domain data, never a database read. */
onboarding.get("/templates", (c) =>
  c.json({
    subjects: STARTER_SUBJECTS.map((s) => ({
      name: s.name,
      monogram: monogramFor(s.name),
      topicCount: s.topics.length,
      // The picker says which set ships worked example material (P22), so the
      // hint on the row and the rows that get created cannot drift apart.
      hasExample: Boolean(s.example),
    })),
  }),
);

/** Has this account finished onboarding? */
onboarding.get("/state", async (c) => {
  const session = await getSession(c.req.raw.headers, c.get("auth"));
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const profile = await profileFor(session.user.id);
  if (!profile) return c.json({ error: "no_profile" }, 409);

  const settings = (profile.settings ?? {}) as { onboardedAt?: string };
  // Scoped to this user: a global count would leak how much other accounts have.
  const counted = await db.orm
    .select({ value: count() })
    .from(subjects)
    .where(eq(subjects.userId, profile.id));

  return c.json({
    onboardedAt: settings.onboardedAt ?? null,
    needsOnboarding: !settings.onboardedAt,
    subjectCount: counted[0]?.value ?? 0,
  });
});

/**
 * Copy one template's worked example into the student's own rows (P22): the note,
 * the quiz and its questions, the deck and its cards — the same three things the
 * AI flow writes, shipped as text so a first run does not depend on a provider key.
 * Everything hangs off the subject's own topic row, so the topic quest's steps
 * deep-link straight into real material.
 */
async function insertExample(
  userId: string,
  subjectId: string,
  example: StarterExample,
  topicRows: { id: string; name: string; subjectId: string | null }[],
): Promise<void> {
  const topicId =
    topicRows.find((t) => t.subjectId === subjectId && t.name === example.note.topic)?.id ?? null;

  const [note] = await db.orm
    .insert(notes)
    .values({
      userId,
      topicId,
      title: example.note.title,
      bodyMd: example.note.bodyMd,
      wordCount: example.note.bodyMd.split(/\s+/).filter(Boolean).length,
    })
    .returning({ id: notes.id });

  const [quiz] = await db.orm
    .insert(quizzes)
    .values({
      userId,
      topicId,
      sourceNoteId: note?.id ?? null,
      title: example.quiz.title,
      questionCount: example.quiz.questions.length,
      difficulty: "medium",
      status: "ready",
    })
    .returning({ id: quizzes.id });

  if (quiz) {
    await db.orm.insert(quizQuestions).values(
      example.quiz.questions.map((q, orderIndex) => ({
        quizId: quiz.id,
        orderIndex,
        type: "mcq",
        prompt: q.prompt,
        options: q.options,
        // Grading compares this text against the submitted option (packages/core/quiz).
        correctAnswer: q.answer,
        explanation: q.explanation,
        difficulty: "medium",
        topicId,
        conceptTag: q.conceptTag ?? null,
      })),
    );
  }

  const [deck] = await db.orm
    .insert(flashcardDecks)
    .values({ userId, topicId, sourceNoteId: note?.id ?? null, title: example.deck.title })
    .returning({ id: flashcardDecks.id });

  if (deck) {
    // No dueAt: a null due date counts as due now (routes/flashcards), so the
    // deck is studyable on the first visit rather than tomorrow.
    await db.orm.insert(flashcards).values(
      example.deck.cards.map((c) => ({
        deckId: deck.id,
        topicId,
        front: c.front,
        back: c.back,
      })),
    );
  }
}

/** Copy a starter subject set into this user's own subjects and topics. */
onboarding.post("/subjects", async (c) => {
  const session = await getSession(c.req.raw.headers, c.get("auth"));
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const profile = await profileFor(session.user.id);
  if (!profile) return c.json({ error: "no_profile" }, 409);

  const body = (await c.req.json().catch(() => ({}))) as { subjects?: string[] };
  const wanted = new Set(body.subjects ?? []);
  const chosen = STARTER_SUBJECTS.filter((s) => wanted.has(s.name));

  if (chosen.length === 0) return c.json({ error: "no_subjects_selected" }, 400);

  // Replace rather than merge, so re-running onboarding cannot duplicate subjects.
  await db.orm.delete(subjects).where(eq(subjects.userId, profile.id));
  // Quests pointed at those subjects — replace them too, for the same reason
  // (P13: a starter quest is part of what this endpoint hands out).
  await db.orm.delete(quests).where(eq(quests.userId, profile.id));

  const created = await db.orm
    .insert(subjects)
    .values(
      chosen.map((s, index) => ({
        userId: profile.id,
        name: s.name,
        // The template carries its own approved monogram; monogramFor is only the
        // fallback for subjects the student creates themselves.
        monogram: s.monogram,
        orderIndex: index,
      })),
    )
    .returning({ id: subjects.id, name: subjects.name });

  const topicRows = created.flatMap((row, index) =>
    (chosen[index]?.topics ?? []).map((t, order) => ({
      subjectId: row.id,
      name: t.name,
      description: t.description,
      orderIndex: order,
    })),
  );
  const insertedTopics =
    topicRows.length > 0
      ? await db.orm
          .insert(topics)
          .values(topicRows)
          .returning({ id: topics.id, name: topics.name, subjectId: topics.subjectId })
      : [];

  // Worked example material (P22): the subject that ships it arrives with a real
  // note, a quiz over it and a deck of its key terms, so the quest handed out
  // below walks into material instead of empty screens.
  for (const row of created) {
    const subject = chosen.find((s) => s.name === row.name);
    if (subject?.example) {
      await insertExample(profile.id, row.id, subject.example, insertedTopics);
    }
  }

  // The first-run experience has quests waiting (P13, P22): the canonical
  // "Master {topic}" over the first topic of the first chosen subject — its steps
  // deep-link into whichever activities the student builds first — plus the week
  // itself, so day one has a number to hit as well as a path to walk.
  const first = created[0];
  if (first) {
    const [firstTopic] = await db.orm
      .select({ id: topics.id })
      .from(topics)
      .where(eq(topics.subjectId, first.id))
      .orderBy(asc(topics.orderIndex))
      .limit(1);
    if (firstTopic) await createQuest(profile.id, { template: "topic", topicId: firstTopic.id });
  }
  await createQuest(profile.id, { template: "weekly" });

  return c.json({ subjects: created, topicCount: topicRows.length }, 201);
});

/** Close onboarding: record the moment and open a fresh streak. */
onboarding.post("/complete", async (c) => {
  const session = await getSession(c.req.raw.headers, c.get("auth"));
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const profile = await profileFor(session.user.id);
  if (!profile) return c.json({ error: "no_profile" }, 409);

  const settings = (profile.settings ?? {}) as Record<string, unknown>;
  await db.orm
    .update(users)
    .set({ settings: { ...settings, onboardedAt: new Date().toISOString() } })
    .where(eq(users.id, profile.id));

  await db.orm.insert(streaks).values({ userId: profile.id }).onConflictDoNothing();

  return c.json({ ok: true });
});

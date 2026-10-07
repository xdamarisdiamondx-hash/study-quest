/**
 * Quiz lifecycle (P8): generate → take → grade → retry.
 *
 * Generation and storage are one call — POST /api/quizzes — because the composer's
 * output is never editable before the run: a quiz the client could rewrite would grade
 * against answers the client had already seen. Questions therefore leave the server
 * without `correctAnswer` or `explanation`; both come back inside the attempt response,
 * which is also where grading happens. The rule runs once, server-side, and the results
 * screen renders the verdicts it is given — it never re-grades.
 *
 * Retries (PRD §13) are ordinary quizzes with two extra columns: `retryOf` names the
 * quiz whose mistakes produced them, and `focusTags` carries the concepts to drill. The
 * focus is derived here from the original's latest attempt, so what a retry targets can
 * always be explained from stored data.
 *
 * A graded attempt also fires the P13 quest signal: "complete quiz" listens for this
 * event (and "final challenge" for this event at PASS_SCORE), so PRD §20's stepper
 * fills itself while the student studies.
 */
import { Hono } from "hono";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import {
  generateQuizSchema,
  quizOutputSchema,
  submitQuizAttemptSchema,
  type QuizType,
} from "@sq/core/schemas/ai";
import { gradeQuiz, nextMastery, retryFocus, scoreOf, weakConcepts } from "@sq/core/quiz";
import {
  notes,
  questionMastery,
  quizAttempts,
  quizQuestions,
  quizzes,
  subjects,
  topics,
} from "@sq/db/schema";

import { requireProfile, type ProfileEnv } from "../auth/currentProfile.ts";
import { runPrompt } from "../ai/run.ts";
import { db } from "../db.ts";
import { recordQuestSignal } from "../services/quests.ts";

export const quizzesRouter = new Hono<ProfileEnv>();

quizzesRouter.use("*", async (c, next) => {
  const denied = await requireProfile(c);
  if (denied) return denied;
  await next();
});

/* --- ownership helpers ---------------------------------------------------
 * Duplicated from routes/ai.ts and routes/subjects.ts on purpose: each router keeps
 * its own guards rather than exporting helpers across route modules. */

async function ownsNote(profileId: string, noteId: string) {
  const [note] = await db.orm
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, profileId)))
    .limit(1);
  return note ?? null;
}

async function ownsSubject(profileId: string, subjectId: string): Promise<boolean> {
  const [row] = await db.orm
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.id, subjectId), eq(subjects.userId, profileId)))
    .limit(1);
  return row !== undefined;
}

/** A topic only if its subject belongs to the caller. */
async function ownsTopic(profileId: string, topicId: string) {
  const [topic] = await db.orm.select().from(topics).where(eq(topics.id, topicId)).limit(1);
  if (!topic) return null;
  if (!(await ownsSubject(profileId, topic.subjectId))) return null;
  return topic;
}

async function ownsQuiz(profileId: string, quizId: string) {
  const [quiz] = await db.orm
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.id, quizId), eq(quizzes.userId, profileId)))
    .limit(1);
  return quiz ?? null;
}

/* --- generation ---------------------------------------------------------- */

/**
 * What a quiz is generated from.
 *
 * `words` is checked before any model call: a note too thin to quiz on gets a clear
 * 400 rather than a generation that fails validation after spending the request.
 */
interface QuizSource {
  title: string;
  bodyMd: string;
  words: number;
  topicId: string | null;
  sourceNoteId: string | null;
  topicName?: string;
}

const MIN_SOURCE_WORDS = 30;

async function noteSource(profileId: string, noteId: string): Promise<QuizSource | null> {
  const note = await ownsNote(profileId, noteId);
  if (!note) return null;
  let topicName: string | undefined;
  if (note.topicId) {
    const [topic] = await db.orm
      .select({ name: topics.name })
      .from(topics)
      .where(eq(topics.id, note.topicId))
      .limit(1);
    topicName = topic?.name;
  }
  return {
    title: note.title,
    bodyMd: note.bodyMd,
    words: note.wordCount,
    topicId: note.topicId,
    sourceNoteId: note.id,
    ...(topicName ? { topicName } : {}),
  };
}

/** A topic's whole quiz source: every note under it, titled, in creation order. */
async function topicSource(profileId: string, topicId: string): Promise<QuizSource | null> {
  const topic = await ownsTopic(profileId, topicId);
  if (!topic) return null;
  const rows = await db.orm
    .select()
    .from(notes)
    .where(and(eq(notes.topicId, topic.id), eq(notes.userId, profileId)))
    .orderBy(asc(notes.createdAt));
  return {
    title: topic.name,
    bodyMd: rows.map((n) => `## ${n.title}\n${n.bodyMd}`).join("\n\n"),
    words: rows.reduce((sum, n) => sum + n.wordCount, 0),
    topicId: topic.id,
    sourceNoteId: null,
    topicName: topic.name,
  };
}

/** The questions of a quiz as the taking screen sees them — no answers attached. */
function questionView(row: typeof quizQuestions.$inferSelect) {
  return {
    id: row.id,
    orderIndex: row.orderIndex,
    type: row.type as QuizType,
    prompt: row.prompt,
    options: row.options,
    difficulty: row.difficulty as "easy" | "medium" | "hard",
    conceptTag: row.conceptTag,
  };
}

/** The quiz row plus its questions, without answers — the shared response shape. */
async function quizWithQuestions(quiz: typeof quizzes.$inferSelect) {
  const rows = await db.orm
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quiz.id))
    .orderBy(asc(quizQuestions.orderIndex));
  return { ...quiz, questions: rows.map(questionView) };
}

async function latestAttempt(quizId: string, profileId: string) {
  const [row] = await db.orm
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.userId, profileId)))
    .orderBy(desc(quizAttempts.completedAt))
    .limit(1);
  return row ?? null;
}

quizzesRouter.post("/", async (c) => {
  const profileId = c.get("profileId");
  const raw = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = generateQuizSchema.safeParse(raw);
  if (!parsed.success)
    return c.json(
      { error: "invalid", issues: parsed.error.issues.map((i: { message: string }) => i.message) },
      400,
    );
  const body = parsed.data;

  /* --- resolve the source and, for a retry, the focus ------------------- */

  let source: QuizSource | null = null;
  let retryOf: string | null = null;
  let focusTags: string[] = [];

  if (body.retryOf) {
    const original = await ownsQuiz(profileId, body.retryOf);
    if (!original) return c.json({ error: "not_found" }, 404);
    retryOf = original.id;

    source = original.sourceNoteId
      ? await noteSource(profileId, original.sourceNoteId)
      : original.topicId
        ? await topicSource(profileId, original.topicId)
        : null;
    if (!source)
      return c.json(
        {
          error: "source_missing",
          message: "The original quiz no longer has a note or topic to draw from.",
        },
        400,
      );

    // The focus is what the latest attempt actually missed — derived from stored
    // answers, so "Retry: Momentum" names real mistakes rather than a guess.
    const last = await latestAttempt(original.id, profileId);
    const wrongIds = (last?.answers ?? []).filter((a) => !a.correct).map((a) => a.questionId);
    if (wrongIds.length > 0) {
      const wrong = await db.orm
        .select({ conceptTag: quizQuestions.conceptTag })
        .from(quizQuestions)
        .where(and(inArray(quizQuestions.id, wrongIds), eq(quizQuestions.quizId, original.id)));
      focusTags = retryFocus(
        weakConcepts(wrong.map((w) => ({ conceptTag: w.conceptTag, correct: false }))),
      );
    }
  } else if (body.noteId) {
    source = await noteSource(profileId, body.noteId);
  } else if (body.topicId) {
    source = await topicSource(profileId, body.topicId);
  }

  if (!source) return c.json({ error: "not_found" }, 404);
  if (source.words < MIN_SOURCE_WORDS)
    return c.json(
      {
        error: "source_empty",
        message: `${source.sourceNoteId ? "This note is" : "These notes are"} too short to make a quiz from — add a little more detail first.`,
      },
      400,
    );

  /* --- generate --------------------------------------------------------- */

  const result = await runPrompt({
    profileId,
    key: "quiz.v1",
    input: {
      title: source.title,
      bodyMd: source.bodyMd,
      questionCount: body.questionCount,
      difficulty: body.difficulty,
      types: body.types,
      ...(source.topicName ? { topicName: source.topicName } : {}),
      ...(focusTags.length > 0 ? { focusTags } : {}),
    },
    sourceId: source.sourceNoteId ?? source.topicId ?? source.title,
    sourceType: source.sourceNoteId ? "note" : "topic",
    options: {
      questionCount: body.questionCount,
      difficulty: body.difficulty,
      types: body.types,
      ...(focusTags.length > 0 ? { focusTags } : {}),
    },
    // A press of Generate wants a quiz, not last time's quiz: bypass the cache the way
    // Regenerate does (ADR-008). Retries never need it — their focusTags change the key.
    fresh: raw.fresh === true || body.retryOf !== undefined,
  });

  const output = quizOutputSchema.parse(result.value);
  const title =
    retryOf && focusTags.length > 0 ? `Retry: ${focusTags.join(", ")}`.slice(0, 120) : output.title;

  /* --- persist ---------------------------------------------------------- */

  const [quiz] = await db.orm
    .insert(quizzes)
    .values({
      userId: profileId,
      topicId: source.topicId,
      sourceNoteId: source.sourceNoteId,
      title,
      questionCount: output.questions.length,
      difficulty: body.difficulty,
      status: "ready",
      retryOf,
      focusTags,
    })
    .returning();
  if (!quiz) return c.json({ error: "internal_error" }, 500);

  try {
    await db.orm.insert(quizQuestions).values(
      output.questions.map((q, i) => ({
        quizId: quiz.id,
        orderIndex: i,
        type: q.type,
        prompt: q.prompt,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation ?? null,
        difficulty: q.difficulty ?? "medium",
        topicId: source.topicId,
        conceptTag: q.conceptTag ?? null,
      })),
    );
  } catch (err) {
    // A quiz with no questions would sit in the list as a dead row; take it back out.
    await db.orm.delete(quizzes).where(eq(quizzes.id, quiz.id));
    throw err;
  }

  return c.json({ quiz: await quizWithQuestions(quiz) });
});

/* --- list ---------------------------------------------------------------- */

quizzesRouter.get("/", async (c) => {
  const profileId = c.get("profileId");
  const subjectId = c.req.query("subjectId");
  const topicId = c.req.query("topicId");

  let topicFilter: string[] | null = null;
  if (topicId) {
    const topic = await ownsTopic(profileId, topicId);
    if (!topic) return c.json({ error: "not_found" }, 404);
    topicFilter = [topic.id];
  } else if (subjectId) {
    if (!(await ownsSubject(profileId, subjectId))) return c.json({ error: "not_found" }, 404);
    const rows = await db.orm
      .select({ id: topics.id })
      .from(topics)
      .where(eq(topics.subjectId, subjectId));
    topicFilter = rows.map((r) => r.id);
    if (topicFilter.length === 0) return c.json({ quizzes: [] });
  }

  const rows = await db.orm
    .select()
    .from(quizzes)
    .where(
      topicFilter
        ? and(eq(quizzes.userId, profileId), inArray(quizzes.topicId, topicFilter))
        : eq(quizzes.userId, profileId),
    )
    .orderBy(desc(quizzes.createdAt));

  const ids = rows.map((r) => r.id);
  const attempts =
    ids.length > 0
      ? await db.orm
          .select()
          .from(quizAttempts)
          .where(and(eq(quizAttempts.userId, profileId), inArray(quizAttempts.quizId, ids)))
          .orderBy(asc(quizAttempts.completedAt))
      : [];

  const byQuiz = new Map<string, typeof attempts>();
  for (const attempt of attempts) {
    const list = byQuiz.get(attempt.quizId) ?? [];
    list.push(attempt);
    byQuiz.set(attempt.quizId, list);
  }

  return c.json({
    quizzes: rows.map((quiz) => ({
      id: quiz.id,
      title: quiz.title,
      questionCount: quiz.questionCount,
      difficulty: quiz.difficulty,
      topicId: quiz.topicId,
      sourceNoteId: quiz.sourceNoteId,
      retryOf: quiz.retryOf,
      focusTags: quiz.focusTags,
      createdAt: quiz.createdAt,
      attempts: (byQuiz.get(quiz.id) ?? []).map((a) => ({
        id: a.id,
        score: a.score,
        total: a.total,
        durationMs: a.durationMs,
        mode: a.mode,
        completedAt: a.completedAt,
      })),
    })),
  });
});

/* --- one quiz ------------------------------------------------------------ */

quizzesRouter.get("/:id", async (c) => {
  const profileId = c.get("profileId");
  const quiz = await ownsQuiz(profileId, c.req.param("id"));
  if (!quiz) return c.json({ error: "not_found" }, 404);

  const past = await db.orm
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.quizId, quiz.id), eq(quizAttempts.userId, profileId)))
    .orderBy(asc(quizAttempts.completedAt))
    .limit(50);

  const view = await quizWithQuestions(quiz);
  return c.json({
    quiz: {
      ...view,
      attempts: past.map((a) => ({
        id: a.id,
        score: a.score,
        total: a.total,
        durationMs: a.durationMs,
        mode: a.mode,
        completedAt: a.completedAt,
      })),
    },
  });
});

/* --- submit an attempt --------------------------------------------------- */

quizzesRouter.post("/:id/attempts", async (c) => {
  const profileId = c.get("profileId");
  const quiz = await ownsQuiz(profileId, c.req.param("id"));
  if (!quiz) return c.json({ error: "not_found" }, 404);

  const parsed = submitQuizAttemptSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json(
      { error: "invalid", issues: parsed.error.issues.map((i: { message: string }) => i.message) },
      400,
    );
  const body = parsed.data;

  const questions = await db.orm
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quiz.id))
    .orderBy(asc(quizQuestions.orderIndex));

  // An id outside this quiz is a bad request, not a silently dropped answer.
  const known = new Set(questions.map((q) => q.id));
  if (body.answers.some((a) => !known.has(a.questionId)))
    return c.json(
      {
        error: "unknown_question",
        message: "The submission names a question this quiz does not have.",
      },
      400,
    );

  const results = gradeQuiz(questions, body.answers);

  /* Short answers the rules could not settle come back for a human verdict *before*
   * anything is stored: keyword overlap found some of the reference but not all, so the
   * student compares and decides. Score and mastery are therefore written exactly once,
   * when every answer has settled — not once provisional and once corrected. */
  const submittedBy = new Map(body.answers.map((a) => [a.questionId, a]));
  const pending = results.flatMap((r, i) => {
    const q = questions[i];
    if (!q || r.verdict !== "needs_review" || submittedBy.get(r.questionId)?.selfMark) return [];
    return [
      {
        questionId: r.questionId,
        prompt: q.prompt,
        type: q.type as QuizType,
        answer: r.answer,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
      },
    ];
  });
  if (pending.length > 0) return c.json({ pending });

  const { score, total } = scoreOf(results);
  const completedAt = new Date();
  const startedAt = new Date(completedAt.getTime() - body.durationMs);

  const [attempt] = await db.orm
    .insert(quizAttempts)
    .values({
      quizId: quiz.id,
      userId: profileId,
      mode: quiz.retryOf ? "retry" : "original",
      startedAt,
      completedAt,
      score,
      total,
      durationMs: body.durationMs,
      answers: results.map((r) => ({
        questionId: r.questionId,
        answer: r.answer,
        verdict: r.verdict,
        correct: r.correct,
      })),
    })
    .returning();

  /* --- mastery ---------------------------------------------------------- *
   * Only for questions that carry a concept tag and a topic: both are parts of
   * question_mastery's key, so an untagged or unfiled question has no row to hold. */

  const mastery: { conceptTag: string; mastery: number; attempts: number; correct: number }[] = [];
  if (quiz.topicId) {
    const groups = new Map<string, { display: string; correct: boolean[] }>();
    questions.forEach((q, i) => {
      const tag = q.conceptTag?.trim();
      const result = results[i];
      if (!tag || !result) return;
      const key = tag.toLowerCase();
      const group = groups.get(key) ?? { display: tag, correct: [] };
      group.correct.push(result.correct);
      groups.set(key, group);
    });

    if (groups.size > 0) {
      const existing = await db.orm
        .select()
        .from(questionMastery)
        .where(
          and(eq(questionMastery.userId, profileId), eq(questionMastery.topicId, quiz.topicId)),
        );

      for (const [key, group] of groups) {
        // Match an existing row by case-insensitive tag so "Momentum" and "momentum"
        // fold into one row instead of splitting the concept's history in two.
        const row = existing.find((r) => r.conceptTag.toLowerCase() === key);
        let state = {
          attempts: row?.attempts ?? 0,
          correct: row?.correct ?? 0,
          mastery: row?.mastery ?? 0,
        };
        for (const wasCorrect of group.correct) state = nextMastery(state, wasCorrect);

        const storedTag = row?.conceptTag ?? group.display;
        await db.orm
          .insert(questionMastery)
          .values({
            userId: profileId,
            topicId: quiz.topicId,
            conceptTag: storedTag,
            attempts: state.attempts,
            correct: state.correct,
            mastery: state.mastery,
            lastSeenAt: completedAt,
          })
          .onConflictDoUpdate({
            target: [questionMastery.userId, questionMastery.topicId, questionMastery.conceptTag],
            set: {
              attempts: sql`excluded.attempts`,
              correct: sql`excluded.correct`,
              mastery: sql`excluded.mastery`,
              lastSeenAt: sql`excluded.last_seen_at`,
            },
          });

        mastery.push({
          conceptTag: storedTag,
          mastery: state.mastery,
          attempts: state.attempts,
          correct: state.correct,
        });
      }
    }
  }

  /* --- the results the screen renders ----------------------------------- */

  const review = questions.map((q, i) => ({
    ...questionView(q),
    answer: results[i]?.answer ?? "",
    verdict: results[i]?.verdict ?? "incorrect",
    correct: results[i]?.correct ?? false,
    correctAnswer: q.correctAnswer,
    explanation: q.explanation,
  }));

  const weak = weakConcepts(review.map((r) => ({ conceptTag: r.conceptTag, correct: r.correct })));

  // A retry answers "did it help?" against the attempt that produced it.
  let comparison: { original: { score: number; total: number } } | null = null;
  if (quiz.retryOf) {
    const original = await ownsQuiz(profileId, quiz.retryOf);
    const last = original ? await latestAttempt(original.id, profileId) : null;
    if (last) comparison = { original: { score: last.score, total: last.total } };
  }

  if (!attempt) return c.json({ error: "internal_error" }, 500);

  /* --- quest steps (P13): the graded attempt is the success event ---------- */
  const questOutcome =
    quiz.topicId && attempt.total > 0
      ? await recordQuestSignal(profileId, {
          type: "quiz",
          topicIds: [quiz.topicId],
          subjectIds: [],
          score: attempt.score / attempt.total,
        })
      : null;
  const quest =
    questOutcome && (questOutcome.stepsCompleted > 0 || questOutcome.questsCompleted.length > 0)
      ? questOutcome
      : null;

  return c.json({
    attempt: {
      id: attempt.id,
      score: attempt.score,
      total: attempt.total,
      durationMs: attempt.durationMs,
      mode: attempt.mode,
      completedAt: attempt.completedAt,
      answers: attempt.answers,
    },
    review,
    weak,
    mastery,
    comparison,
    quest,
  });
});

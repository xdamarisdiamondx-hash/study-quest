/**
 * Flashcard lifecycle (P9): generate → edit → save → study → schedule.
 *
 * Generation and storage are two calls here, unlike quizzes (P8) — and that
 * difference is the phase's contract. A quiz's output must never be editable
 * before the run, because the runner grades against it; a deck's output exists
 * to be edited (PRD §14's cards, the composer's corrections) before anything is
 * saved, so POST /generate hands cards to the composer and only the student's
 * final version is persisted by POST /decks.
 *
 * Scheduling is the server's authority: every change to ease, interval and
 * due_at arrives through POST /reviews, which runs core/flashcards' schedule()
 * — the same function the study screen runs to preview the next interval the
 * moment a rating is pressed, so the preview cannot disagree with the store.
 *
 * Ratings arrive per batch (one study session). The batch id makes a re-posted
 * session idempotent: a flush after a crash, a retry, or a double-click skips
 * rows it already applied instead of running the schedule over them twice —
 * the lesson ADR-031 drew for quiz submissions, applied to spaced repetition.
 *
 * A rated batch also fires the P13 quest signal: every topic whose cards were
 * touched completes matching "study flashcards" steps (PRD §20), while the
 * re-post safety above keeps the signal harmless to fire twice.
 */
import { Hono } from "hono";
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { XP } from "@sq/core/gamification";
import { parseImport, schedule } from "@sq/core/flashcards";
import {
  cardWriteSchema,
  createDeckSchema,
  dueQuerySchema,
  flashcardOutputSchema,
  generateDeckSchema,
  importCardsSchema,
  patchCardSchema,
  submitReviewsSchema,
} from "@sq/core/schemas/ai";
import {
  flashcardDecks,
  flashcardReviews,
  flashcards,
  notes,
  subjects,
  topics,
  xpLedger,
} from "@sq/db/schema";

import { requireProfile, type ProfileEnv } from "../auth/currentProfile.ts";
import { runPrompt } from "../ai/run.ts";
import { db } from "../db.ts";
import { recordQuestSignal } from "../services/quests.ts";
import { recordActivity } from "../services/xp.ts";

export const flashcardsRouter = new Hono<ProfileEnv>();

flashcardsRouter.use("*", async (c, next) => {
  const denied = await requireProfile(c);
  if (denied) return denied;
  await next();
});

function notFound() {
  return Response.json({ error: "not_found" }, { status: 404 });
}

function invalid(err: { issues: { message: string }[] }) {
  return Response.json(
    { error: "invalid", issues: err.issues.map((i) => i.message) },
    { status: 400 },
  );
}

/* --- ownership helpers -------------------------------------------------
   Duplicated from routes/ai.ts, routes/subjects.ts and routes/quizzes.ts on
   purpose: each router stays readable as a whole, and a lookup that decides
   "may this caller touch this row" is worth reading where it guards.
*/

/** Does this note belong to the caller? */
async function ownsNote(profileId: string, noteId: string) {
  const [row] = await db.orm
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, profileId)))
    .limit(1);
  return row ?? null;
}

/** Does this topic belong to the caller? Topics own through their subject. */
async function ownsTopic(profileId: string, topicId: string) {
  const [topic] = await db.orm.select().from(topics).where(eq(topics.id, topicId)).limit(1);
  if (!topic) return null;
  if (!(await ownsSubject(profileId, topic.subjectId))) return null;
  return topic;
}

/** Does this subject belong to the caller? */
async function ownsSubject(profileId: string, subjectId: string): Promise<boolean> {
  const [row] = await db.orm
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.id, subjectId), eq(subjects.userId, profileId)))
    .limit(1);
  return row !== undefined;
}

/** Does this deck belong to the caller? */
async function ownsDeck(profileId: string, deckId: string) {
  const [row] = await db.orm
    .select()
    .from(flashcardDecks)
    .where(and(eq(flashcardDecks.id, deckId), eq(flashcardDecks.userId, profileId)))
    .limit(1);
  return row ?? null;
}

/** Does this card — through its deck — belong to the caller? */
async function ownsCard(profileId: string, cardId: string) {
  const [row] = await db.orm
    .select({ card: flashcards })
    .from(flashcards)
    .innerJoin(flashcardDecks, eq(flashcards.deckId, flashcardDecks.id))
    .where(and(eq(flashcards.id, cardId), eq(flashcardDecks.userId, profileId)))
    .limit(1);
  return row?.card ?? null;
}

/* --- what a deck is generated from --------------------------------------
   Mirrors routes/quizzes.ts's source builders: the same material, in the same
   shape, so the two prompt families read the student's work identically.
   `words` is checked before any model call — a note too thin for a deck gets a
   clear 400 rather than a generation that fails validation after spending it.
*/

interface DeckSource {
  title: string;
  bodyMd: string;
  words: number;
  topicId: string | null;
  sourceNoteId: string | null;
  topicName?: string;
}

const MIN_SOURCE_WORDS = 30;

async function noteSource(profileId: string, noteId: string): Promise<DeckSource | null> {
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

/** A topic's whole source: every note under it, titled, in creation order. */
async function topicSource(profileId: string, topicId: string): Promise<DeckSource | null> {
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

/* --- generate ----------------------------------------------------------- */

flashcardsRouter.post("/generate", async (c) => {
  const profileId = c.get("profileId");
  const raw = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = generateDeckSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const body = parsed.data;

  const source = body.noteId
    ? await noteSource(profileId, body.noteId)
    : body.topicId
      ? await topicSource(profileId, body.topicId)
      : null;
  if (!source) return notFound();

  if (source.words < MIN_SOURCE_WORDS)
    return c.json(
      {
        error: "source_empty",
        message: `${source.sourceNoteId ? "This note is" : "These notes are"} too short to make flashcards from — add a little more detail first.`,
      },
      400,
    );

  const result = await runPrompt({
    profileId,
    key: "flashcards.v1",
    input: {
      title: source.title,
      bodyMd: source.bodyMd,
      cardCount: body.cardCount,
      ...(source.topicName ? { topicName: source.topicName } : {}),
    },
    sourceId: source.sourceNoteId ?? source.topicId ?? source.title,
    sourceType: source.sourceNoteId ? "note" : "topic",
    options: { cardCount: body.cardCount },
    // A press of Generate wants new cards, not last time's (A.8): bypass the
    // cache the way quiz generation does (ADR-008).
    fresh: raw.fresh === true,
  });

  const output = flashcardOutputSchema.parse(result.value);
  return c.json({ title: output.title, cards: output.cards });
});

/* --- save a deck -------------------------------------------------------- */

flashcardsRouter.post("/decks", async (c) => {
  const profileId = c.get("profileId");
  const parsed = createDeckSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return invalid(parsed.error);
  const body = parsed.data;

  if (body.topicId && !(await ownsTopic(profileId, body.topicId))) return notFound();
  if (body.sourceNoteId && !(await ownsNote(profileId, body.sourceNoteId))) return notFound();

  const [deck] = await db.orm
    .insert(flashcardDecks)
    .values({
      userId: profileId,
      topicId: body.topicId ?? null,
      sourceNoteId: body.sourceNoteId ?? null,
      title: body.title,
    })
    .returning();
  if (!deck) return c.json({ error: "internal_error" }, 500);

  // Cards have no order column; the paste order is the order they are saved in
  // (see flashcards.created_at), so a bulk save stamps millisecond offsets.
  const base = Date.now();
  try {
    await db.orm.insert(flashcards).values(
      body.cards.map((card, i) => ({
        deckId: deck.id,
        topicId: deck.topicId,
        front: card.front,
        back: card.back,
        createdAt: new Date(base + i),
      })),
    );
  } catch (err) {
    // A deck with no cards would sit in the list as a dead row; take it back out.
    await db.orm.delete(flashcardDecks).where(eq(flashcardDecks.id, deck.id));
    throw err;
  }

  return c.json({ deck: await deckWithCards(deck) });
});

/* --- list ---------------------------------------------------------------- */

flashcardsRouter.get("/decks", async (c) => {
  const profileId = c.get("profileId");
  const subjectId = c.req.query("subjectId");
  const topicId = c.req.query("topicId");

  let topicFilter: string[] | null = null;
  if (topicId) {
    const topic = await ownsTopic(profileId, topicId);
    if (!topic) return notFound();
    topicFilter = [topic.id];
  } else if (subjectId) {
    if (!(await ownsSubject(profileId, subjectId))) return notFound();
    const rows = await db.orm
      .select({ id: topics.id })
      .from(topics)
      .where(eq(topics.subjectId, subjectId));
    topicFilter = rows.map((r) => r.id);
    if (topicFilter.length === 0) return c.json({ decks: [] });
  }

  const rows = await db.orm
    .select()
    .from(flashcardDecks)
    .where(
      topicFilter
        ? and(eq(flashcardDecks.userId, profileId), inArray(flashcardDecks.topicId, topicFilter))
        : eq(flashcardDecks.userId, profileId),
    )
    .orderBy(desc(flashcardDecks.createdAt));
  if (rows.length === 0) return c.json({ decks: [] });

  const ids = rows.map((r) => r.id);
  const counts = await deckCounts(ids);
  const topicNamesMap = await topicNames([
    ...new Set(rows.map((r) => r.topicId).filter((t): t is string => t !== null)),
  ]);
  const noteTitlesMap = await noteTitles([
    ...new Set(rows.map((r) => r.sourceNoteId).filter((n): n is string => n !== null)),
  ]);

  return c.json({
    decks: rows.map((deck) => ({
      id: deck.id,
      title: deck.title,
      topicId: deck.topicId,
      topicName: deck.topicId ? (topicNamesMap.get(deck.topicId) ?? null) : null,
      sourceNoteId: deck.sourceNoteId,
      sourceNoteTitle: deck.sourceNoteId ? (noteTitlesMap.get(deck.sourceNoteId) ?? null) : null,
      cardCount: counts.get(deck.id)?.total ?? 0,
      dueCount: counts.get(deck.id)?.due ?? 0,
      createdAt: deck.createdAt,
    })),
  });
});

/* --- one deck ------------------------------------------------------------ */

flashcardsRouter.get("/decks/:id", async (c) => {
  const profileId = c.get("profileId");
  const deck = await ownsDeck(profileId, c.req.param("id"));
  if (!deck) return notFound();
  return c.json({ deck: await deckWithCards(deck) });
});

flashcardsRouter.delete("/decks/:id", async (c) => {
  const profileId = c.get("profileId");
  const deleted = await db.orm
    .delete(flashcardDecks)
    .where(and(eq(flashcardDecks.id, c.req.param("id")), eq(flashcardDecks.userId, profileId)))
    .returning({ id: flashcardDecks.id });
  if (deleted.length === 0) return notFound();
  return c.json({ ok: true });
});

/* --- manual cards --------------------------------------------------------- */

flashcardsRouter.post("/decks/:id/cards", async (c) => {
  const profileId = c.get("profileId");
  const deck = await ownsDeck(profileId, c.req.param("id"));
  if (!deck) return notFound();

  const parsed = cardWriteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return invalid(parsed.error);

  const [card] = await db.orm
    .insert(flashcards)
    .values({ deckId: deck.id, topicId: deck.topicId, ...parsed.data })
    .returning();
  if (!card) return c.json({ error: "internal_error" }, 500);
  return c.json({ card });
});

flashcardsRouter.patch("/cards/:id", async (c) => {
  const profileId = c.get("profileId");
  const card = await ownsCard(profileId, c.req.param("id"));
  if (!card) return notFound();

  const parsed = patchCardSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return invalid(parsed.error);

  const set: { front?: string; back?: string } = {};
  if (parsed.data.front !== undefined) set.front = parsed.data.front;
  if (parsed.data.back !== undefined) set.back = parsed.data.back;

  const [updated] = await db.orm
    .update(flashcards)
    .set(set)
    .where(eq(flashcards.id, card.id))
    .returning();
  if (!updated) return notFound();
  return c.json({ card: updated });
});

flashcardsRouter.delete("/cards/:id", async (c) => {
  const profileId = c.get("profileId");
  const card = await ownsCard(profileId, c.req.param("id"));
  if (!card) return notFound();

  const deleted = await db.orm
    .delete(flashcards)
    .where(eq(flashcards.id, card.id))
    .returning({ id: flashcards.id });
  if (deleted.length === 0) return notFound();
  return c.json({ ok: true });
});

flashcardsRouter.post("/decks/:id/import", async (c) => {
  const profileId = c.get("profileId");
  const deck = await ownsDeck(profileId, c.req.param("id"));
  if (!deck) return notFound();

  const parsed = importCardsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return invalid(parsed.error);

  const { cards, skipped } = parseImport(parsed.data.text);
  if (cards.length > 0) {
    const base = Date.now();
    await db.orm.insert(flashcards).values(
      cards.map((card, i) => ({
        deckId: deck.id,
        topicId: deck.topicId,
        front: card.front,
        back: card.back,
        createdAt: new Date(base + i),
      })),
    );
  }
  // A paste that held nothing usable answers 200 with `added: 0`: the screen
  // reads the count and says so — a malformed paste is not a server error.
  return c.json({ added: cards.length, skipped });
});

/* --- the study queue ------------------------------------------------------ */

flashcardsRouter.get("/due", async (c) => {
  const profileId = c.get("profileId");
  const parsed = dueQuerySchema.safeParse({
    deckId: c.req.query("deckId") || undefined,
    subjectId: c.req.query("subjectId") || undefined,
    limit: c.req.query("limit") || undefined,
  });
  if (!parsed.success) return invalid(parsed.error);
  const { deckId, subjectId, limit } = parsed.data;

  if (deckId && !(await ownsDeck(profileId, deckId))) return notFound();

  let topicFilter: string[] | null = null;
  if (subjectId) {
    if (!(await ownsSubject(profileId, subjectId))) return notFound();
    const rows = await db.orm
      .select({ id: topics.id })
      .from(topics)
      .where(eq(topics.subjectId, subjectId));
    topicFilter = rows.map((r) => r.id);
    // No topics means no cards to review here — and an empty inArray is not a
    // filter, it is a different query.
    if (topicFilter.length === 0) return c.json({ cards: [], totalDue: 0 });
  }

  const now = new Date();
  const due = or(isNull(flashcards.dueAt), lte(flashcards.dueAt, now));
  const scope = and(
    eq(flashcardDecks.userId, profileId),
    deckId ? eq(flashcards.deckId, deckId) : undefined,
    topicFilter ? inArray(flashcards.topicId, topicFilter) : undefined,
    due,
  );

  const [totals] = await db.orm
    .select({ totalDue: sql<number>`count(*)::int` })
    .from(flashcards)
    .innerJoin(flashcardDecks, eq(flashcards.deckId, flashcardDecks.id))
    .where(scope);

  // Never-reviewed cards first (they are due from the moment they are saved),
  // then the overdue oldest-first — new work before catch-up.
  const rows = await db.orm
    .select()
    .from(flashcards)
    .innerJoin(flashcardDecks, eq(flashcards.deckId, flashcardDecks.id))
    .where(scope)
    .orderBy(sql`${flashcards.dueAt} asc nulls first`, asc(flashcards.createdAt))
    .limit(limit);

  return c.json({
    cards: rows.map((r) => r.flashcards),
    totalDue: totals?.totalDue ?? 0,
  });
});

/* --- mastery summary ------------------------------------------------------ */

flashcardsRouter.get("/summary", async (c) => {
  const profileId = c.get("profileId");
  const subjectId = c.req.query("subjectId");

  let topicFilter: string[] | null = null;
  if (subjectId) {
    if (!(await ownsSubject(profileId, subjectId))) return notFound();
    const rows = await db.orm
      .select({ id: topics.id })
      .from(topics)
      .where(eq(topics.subjectId, subjectId));
    topicFilter = rows.map((r) => r.id);
    if (topicFilter.length === 0) return c.json({ due: 0, hard: 0, coverage: [] });
  }

  const scope = () =>
    and(
      eq(flashcardDecks.userId, profileId),
      topicFilter ? inArray(flashcards.topicId, topicFilter) : undefined,
    );

  const [totals] = await db.orm
    .select({
      due: sql<number>`count(*) filter (where ${flashcards.dueAt} is null or ${flashcards.dueAt} <= now())::int`,
      hard: sql<number>`count(*) filter (where ${flashcards.lapses} >= 1)::int`,
    })
    .from(flashcards)
    .innerJoin(flashcardDecks, eq(flashcards.deckId, flashcardDecks.id))
    .where(scope());

  const coverageRows = await db.orm
    .select({
      topicId: flashcards.topicId,
      total: sql<number>`count(*)::int`,
      reviewed: sql<number>`count(*) filter (where ${flashcards.lastReviewedAt} is not null)::int`,
    })
    .from(flashcards)
    .innerJoin(flashcardDecks, eq(flashcards.deckId, flashcardDecks.id))
    .where(scope())
    .groupBy(flashcards.topicId);

  const covered = coverageRows.filter(
    (r): r is typeof r & { topicId: string } => r.topicId !== null,
  );
  const names = await topicNames(covered.map((r) => r.topicId));

  return c.json({
    due: totals?.due ?? 0,
    hard: totals?.hard ?? 0,
    coverage: covered
      .map((r) => ({
        topicId: r.topicId,
        topicName: names.get(r.topicId) ?? "Untitled",
        reviewed: r.reviewed,
        total: r.total,
      }))
      .sort((a, b) => a.topicName.localeCompare(b.topicName)),
  });
});

/* --- rating a batch -------------------------------------------------------- */

flashcardsRouter.post("/reviews", async (c) => {
  const profileId = c.get("profileId");
  const parsed = submitReviewsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return invalid(parsed.error);
  const body = parsed.data;

  const ids = [...new Set(body.reviews.map((r) => r.cardId))];
  const owned = await db.orm
    .select({ card: flashcards })
    .from(flashcards)
    .innerJoin(flashcardDecks, eq(flashcards.deckId, flashcardDecks.id))
    .where(and(eq(flashcardDecks.userId, profileId), inArray(flashcards.id, ids)));
  // A card outside the caller's decks is a bad request, not a dropped rating:
  // silently losing one would leave its schedule quietly wrong.
  if (owned.length !== ids.length) return notFound();
  const cards = new Map(owned.map((r) => [r.card.id, r.card]));

  const now = new Date();
  let studied = 0;
  for (const review of body.reviews) {
    const card = cards.get(review.cardId);
    if (!card) continue; // unreachable — ownership was checked above — but keeps types honest

    const [row] = await db.orm
      .insert(flashcardReviews)
      .values({
        flashcardId: review.cardId,
        batchId: body.batchId,
        rating: review.rating,
        durationMs: review.durationMs,
      })
      .onConflictDoNothing()
      .returning({ id: flashcardReviews.id });
    // Already recorded by an earlier post of this batch: applying the schedule
    // again would push the card's interval forward a second time.
    if (!row) continue;

    await db.orm
      .update(flashcards)
      .set(schedule(card, review.rating, now))
      .where(eq(flashcards.id, review.cardId));
    studied += 1;
  }

  /* --- XP (PRD §18.3: +15 per full batch of 20) -------------------------- */

  const [batch] = await db.orm
    .select({ n: sql<number>`count(*)::int` })
    .from(flashcardReviews)
    .innerJoin(flashcards, eq(flashcardReviews.flashcardId, flashcards.id))
    .innerJoin(flashcardDecks, eq(flashcards.deckId, flashcardDecks.id))
    .where(and(eq(flashcardReviews.batchId, body.batchId), eq(flashcardDecks.userId, profileId)));
  const xp = Math.floor((batch?.n ?? 0) / 20) * XP.flashcardBatch;
  if (xp > 0) {
    // The award is set to the batch's absolute total, so a batch that crossed
    // the 20-card line across two posts lands on the right number — and the
    // unique index keeps a re-post from ever inflating it (ADR-015).
    await db.orm
      .insert(xpLedger)
      .values({
        userId: profileId,
        delta: xp,
        reason: "flashcard_batch",
        sourceType: "batch",
        sourceId: body.batchId,
      })
      .onConflictDoUpdate({
        target: [xpLedger.userId, xpLedger.reason, xpLedger.sourceType, xpLedger.sourceId],
        set: { delta: xp },
      });
  }

  /* --- quest steps (P13): every topic studied completes its flashcard step -- */
  const studiedTopics = [
    ...new Set(
      [...cards.values()].map((card) => card.topicId).filter((id): id is string => Boolean(id)),
    ),
  ];
  const questOutcome =
    studiedTopics.length > 0
      ? await recordQuestSignal(profileId, {
          type: "flashcards",
          topicIds: studiedTopics,
          subjectIds: [],
        })
      : null;
  const quest =
    questOutcome && (questOutcome.stepsCompleted > 0 || questOutcome.questsCompleted.length > 0)
      ? questOutcome
      : null;

  // A fresh rating batch counts as a streak day (plan §18.3). A re-post of the
  // same batch studies nothing (`studied` stays 0), so it can never tick twice.
  if (studied > 0) await recordActivity(profileId);

  return c.json({ studied, xpAwarded: xp, quest });
});

/* --- shared queries -------------------------------------------------------- */

type DeckRow = typeof flashcardDecks.$inferSelect;

/** A deck as the screens read it: its labels, its counts, and its cards in save order. */
async function deckWithCards(deck: DeckRow) {
  const cards = await db.orm
    .select()
    .from(flashcards)
    .where(eq(flashcards.deckId, deck.id))
    .orderBy(asc(flashcards.createdAt), asc(flashcards.id));

  const counts = await deckCounts([deck.id]);
  const topicName = deck.topicId
    ? ((await topicNames([deck.topicId])).get(deck.topicId) ?? null)
    : null;
  const sourceNoteTitle = deck.sourceNoteId
    ? ((await noteTitles([deck.sourceNoteId])).get(deck.sourceNoteId) ?? null)
    : null;

  return {
    id: deck.id,
    title: deck.title,
    topicId: deck.topicId,
    topicName,
    sourceNoteId: deck.sourceNoteId,
    sourceNoteTitle,
    cardCount: counts.get(deck.id)?.total ?? 0,
    dueCount: counts.get(deck.id)?.due ?? 0,
    createdAt: deck.createdAt,
    cards,
  };
}

/** Total and due counts for a set of decks, in one grouped pass. */
async function deckCounts(ids: string[]) {
  const rows =
    ids.length > 0
      ? await db.orm
          .select({
            deckId: flashcards.deckId,
            total: sql<number>`count(*)::int`,
            due: sql<number>`count(*) filter (where ${flashcards.dueAt} is null or ${flashcards.dueAt} <= now())::int`,
          })
          .from(flashcards)
          .where(inArray(flashcards.deckId, ids))
          .groupBy(flashcards.deckId)
      : [];
  return new Map(rows.map((r) => [r.deckId, { total: r.total, due: r.due }]));
}

/** `id → name` for topics, so list rows and coverage tracks can label themselves. */
async function topicNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.orm
    .select({ id: topics.id, name: topics.name })
    .from(topics)
    .where(inArray(topics.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** `id → title` for notes — a deck remembers where it came from. */
async function noteTitles(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.orm
    .select({ id: notes.id, title: notes.title })
    .from(notes)
    .where(inArray(notes.id, ids));
  return new Map(rows.map((r) => [r.id, r.title]));
}

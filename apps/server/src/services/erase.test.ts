/**
 * Erase (P22 privacy page): "delete everything" has to mean everything.
 *
 * The promise the page makes is only worth anything if the cascade is real, so this
 * seeds a profile across essentially every user-owned table — plus a second student
 * who must not lose a row — and checks what is left afterwards. A mocked database
 * would prove nothing: the thing under test *is* the foreign-key graph.
 *
 * The account case is separate: `scope: "account"` also takes the sign-in with it,
 * which is a different table family (Better Auth's) hanging off a text id.
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Db } from "@sq/db/client";
import { createDb } from "@sq/db/client";
import {
  achievements,
  activityLog,
  account,
  aiArtifacts,
  attachments,
  flashcardDecks,
  flashcardReviews,
  flashcards,
  noteRevisions,
  notes,
  plans,
  planBlocks,
  questionMastery,
  questSteps,
  quests,
  quizAttempts,
  quizQuestions,
  quizzes,
  recentSearches,
  recommendationDismissals,
  reminderSettings,
  reminders,
  session,
  sessionSteps,
  streaks,
  studySessions,
  subjects,
  taskRecurrences,
  tasks,
  topics,
  user,
  userAchievements,
  users,
  xpLedger,
} from "@sq/db/schema";
import { eq } from "drizzle-orm";

import { eraseDataSchema } from "@sq/core/schemas/data";

import type { FileStore } from "../files/store.ts";
import { eraseEverything } from "./erase.ts";

/** Count rows for a table + predicate; the values are UUIDs from this database. */
async function count(db: Db, table: string, where = "true"): Promise<number> {
  // Quoted, because the auth table is called `user` — a bare one is a keyword.
  const r = await db.sql(`select count(*)::int as n from "${table}" where ${where}`);
  return Number(r.rows[0]?.n ?? 0);
}

describe("eraseDataSchema", () => {
  it("accepts both scopes when the confirmation phrase is exact", () => {
    expect(eraseDataSchema.parse({ scope: "data", confirm: "ERASE" }).scope).toBe("data");
    expect(eraseDataSchema.parse({ scope: "account", confirm: "ERASE" }).scope).toBe("account");
  });

  it("rejects a missing or misspelled confirmation — a stray POST must fail", () => {
    expect(eraseDataSchema.safeParse({ scope: "data" }).success).toBe(false);
    expect(eraseDataSchema.safeParse({ scope: "data", confirm: "erase" }).success).toBe(false);
    expect(eraseDataSchema.safeParse({ scope: "data", confirm: "yes" }).success).toBe(false);
  });

  it("rejects an unknown scope", () => {
    expect(eraseDataSchema.safeParse({ scope: "everything", confirm: "ERASE" }).success).toBe(
      false,
    );
  });
});

describe("eraseEverything", () => {
  let db: Db;
  let dir: string;

  const deletedFiles: string[] = [];
  const files: FileStore = {
    put: async () => {},
    getUrl: async () => "",
    delete: async (key: string) => {
      deletedFiles.push(key);
    },
  };

  /** The profile whose rows must all vanish. */
  let alice = { id: "", authUserId: "auth-alice" };
  /** A second student, seeded as a control: one of each must survive untouched. */
  let bob = { id: "", authUserId: "auth-bob" };
  /** A third student used for the account case. */
  let carol = { id: "", authUserId: "auth-carol" };

  /** Child rows with no user id of their own — asserted by their own ids. */
  const childIds: string[] = [];
  let bobSearchRows = 0;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "sq-erase-"));
    process.env.PGLITE_DIR = dir;
    // "" is falsy: force the PGlite path even if a DATABASE_URL leaks in.
    db = await createDb("");

    await db.orm.insert(achievements).values({
      code: "first-note",
      name: "First note",
      description: "Wrote a first note",
    });

    for (const auth of [alice.authUserId, bob.authUserId, carol.authUserId]) {
      await db.orm.insert(user).values({
        id: auth,
        name: auth.slice(5),
        email: `${auth}@test.com`,
      });
    }
    await db.orm.insert(account).values({
      id: "acc-alice",
      accountId: alice.authUserId,
      providerId: "credential",
      userId: alice.authUserId,
      password: "hash",
    });
    await db.orm.insert(session).values({
      id: "ses-alice",
      expiresAt: new Date(Date.now() + 86_400_000),
      token: "alice-token",
      userId: alice.authUserId,
    });

    const [a] = await db.orm
      .insert(users)
      .values({ authUserId: alice.authUserId, displayName: "Alice" })
      .returning({ id: users.id });
    const [b] = await db.orm
      .insert(users)
      .values({ authUserId: bob.authUserId, displayName: "Bob" })
      .returning({ id: users.id });
    const [c] = await db.orm
      .insert(users)
      .values({ authUserId: carol.authUserId, displayName: "Carol" })
      .returning({ id: users.id });
    alice = { ...alice, id: a!.id };
    bob = { id: b!.id, authUserId: bob.authUserId };
    carol = { id: c!.id, authUserId: carol.authUserId };

    const track = (row: { id: string }) => {
      childIds.push(row.id);
      return row.id;
    };

    /* --- everything Alice owns ------------------------------------------ */
    const [subject] = await db.orm
      .insert(subjects)
      .values({ userId: alice.id, name: "Physics", monogram: "Ph" })
      .returning({ id: subjects.id });
    const [topic] = await db.orm
      .insert(topics)
      .values({ subjectId: subject!.id, name: "Motion" })
      .returning({ id: topics.id });
    track(topic!);
    const [note] = await db.orm
      .insert(notes)
      .values({ userId: alice.id, topicId: topic!.id, title: "Newton", bodyMd: "v = u + at" })
      .returning({ id: notes.id });
    const [revision] = await db.orm
      .insert(noteRevisions)
      .values({ noteId: note!.id, bodyMd: "v = u" })
      .returning({ id: noteRevisions.id });
    track(revision!);
    await db.orm.insert(attachments).values({
      userId: alice.id,
      noteId: note!.id,
      filename: "diagram.png",
      mimeType: "image/png",
      bytes: 128,
      objectKey: "local/alice/diagram.png",
    });
    await db.orm.insert(aiArtifacts).values({
      userId: alice.id,
      kind: "summary",
      sourceType: "note",
      sourceId: note!.id,
      inputHash: "hash-1",
      provider: "groq",
      model: "llama-3.3-70b",
      promptVersion: "v1",
    });

    const [quiz] = await db.orm
      .insert(quizzes)
      .values({ userId: alice.id, topicId: topic!.id, title: "Checkpoint" })
      .returning({ id: quizzes.id });
    const [question] = await db.orm
      .insert(quizQuestions)
      .values({ quizId: quiz!.id, prompt: "What is 2+2?", correctAnswer: "4" })
      .returning({ id: quizQuestions.id });
    track(question!);
    const [attempt] = await db.orm
      .insert(quizAttempts)
      .values({ quizId: quiz!.id, userId: alice.id, score: 1, total: 1 })
      .returning({ id: quizAttempts.id });
    await db.orm
      .insert(questionMastery)
      .values({ userId: alice.id, topicId: topic!.id, conceptTag: "first-law" });

    const [deck] = await db.orm
      .insert(flashcardDecks)
      .values({ userId: alice.id, topicId: topic!.id, title: "Terms" })
      .returning({ id: flashcardDecks.id });
    const [card] = await db.orm
      .insert(flashcards)
      .values({ deckId: deck!.id, front: "inertia", back: "keeps its velocity" })
      .returning({ id: flashcards.id });
    track(card!);
    await db.orm
      .insert(flashcardReviews)
      .values({ flashcardId: card!.id, batchId: randomUUID(), rating: "good" });

    const [task] = await db.orm
      .insert(tasks)
      .values({ userId: alice.id, title: "Essay" })
      .returning({ id: tasks.id });
    await db.orm.insert(taskRecurrences).values({ taskId: task!.id, anchorAt: new Date() });

    const [studySession] = await db.orm
      .insert(studySessions)
      .values({ userId: alice.id, subjectId: subject!.id, topicId: topic!.id })
      .returning({ id: studySessions.id });
    const [step] = await db.orm
      .insert(sessionSteps)
      .values({ sessionId: studySession!.id, kind: "read_notes" })
      .returning({ id: sessionSteps.id });
    track(step!);

    const [plan] = await db.orm
      .insert(plans)
      .values({ userId: alice.id, date: "2026-10-09" })
      .returning({ id: plans.id });
    const [block] = await db.orm
      .insert(planBlocks)
      .values({ planId: plan!.id, kind: "task" })
      .returning({ id: planBlocks.id });
    track(block!);

    const [quest] = await db.orm
      .insert(quests)
      .values({ userId: alice.id, title: "Master Motion", kind: "topic" })
      .returning({ id: quests.id });
    const [questStep] = await db.orm
      .insert(questSteps)
      .values({ questId: quest!.id, title: "Read the notes", kind: "read_notes" })
      .returning({ id: questSteps.id });
    track(questStep!);

    await db.orm.insert(xpLedger).values({
      userId: alice.id,
      delta: 40,
      reason: "quiz_pass",
      sourceType: "quiz_attempt",
      sourceId: attempt!.id,
    });
    await db.orm
      .insert(userAchievements)
      .values({ userId: alice.id, achievementCode: "first-note" });
    await db.orm.insert(streaks).values({ userId: alice.id, current: 3, longest: 9 });
    await db.orm
      .insert(recommendationDismissals)
      .values({ userId: alice.id, code: "overdue", day: "2026-10-09" });
    await db.orm
      .insert(reminders)
      .values({ userId: alice.id, type: "deadline", fireAt: new Date() });
    await db.orm.insert(reminderSettings).values({ userId: alice.id });
    await db.orm.insert(activityLog).values({ userId: alice.id, kind: "note_created" });
    await db.orm
      .insert(recentSearches)
      .values({ userId: alice.id, key: "newton", query: "Newton" });

    /* --- the control student --------------------------------------------- */
    const [bobSubject] = await db.orm
      .insert(subjects)
      .values({ userId: bob.id, name: "Chemistry", monogram: "Ch" })
      .returning({ id: subjects.id });
    const [bobTopic] = await db.orm
      .insert(topics)
      .values({ subjectId: bobSubject!.id, name: "Reactions" })
      .returning({ id: topics.id });
    await db.orm
      .insert(notes)
      .values({ userId: bob.id, topicId: bobTopic!.id, title: "Bonding", bodyMd: "ions" });

    /* --- the account case ------------------------------------------------- */
    await db.orm.insert(session).values({
      id: "ses-carol",
      expiresAt: new Date(Date.now() + 86_400_000),
      token: "carol-token",
      userId: carol.authUserId,
    });
    await db.orm.insert(account).values({
      id: "acc-carol",
      accountId: carol.authUserId,
      providerId: "credential",
      userId: carol.authUserId,
      password: "hash",
    });
    await db.orm.insert(subjects).values({ userId: carol.id, name: "Biology", monogram: "Bi" });
    await db.orm.insert(attachments).values({
      userId: carol.id,
      filename: "cells.pdf",
      mimeType: "application/pdf",
      bytes: 64,
      objectKey: "local/carol/cells.pdf",
    });

    // The search index is trigger-maintained with no foreign key: prove the
    // triggers actually wrote rows for Alice, and record Bob's slice so the
    // wipe can be shown not to have taken the table with it.
    expect(await count(db, "search_index", `user_id = '${alice.id}'`)).toBeGreaterThan(0);
    bobSearchRows = await count(db, "search_index", `user_id = '${bob.id}'`);
    expect(bobSearchRows).toBeGreaterThan(0);
  }, 60_000);

  afterAll(async () => {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("removes every row the profile owns and leaves other students untouched", async () => {
    const report = await eraseEverything(
      db,
      { id: alice.id, authUserId: alice.authUserId },
      files,
      { deleteAccount: false },
    );

    // Tables that carry the user id themselves.
    const ownedTables = [
      "subjects",
      "attachments",
      "notes",
      "ai_artifacts",
      "quizzes",
      "quiz_attempts",
      "question_mastery",
      "flashcard_decks",
      "tasks",
      "study_sessions",
      "plans",
      "quests",
      "xp_ledger",
      "user_achievements",
      "streaks",
      "recommendation_dismissals",
      "reminders",
      "reminder_settings",
      "activity_log",
      "recent_searches",
      "search_index",
    ];
    for (const table of ownedTables) {
      expect(await count(db, table, `user_id = '${alice.id}'`), `${table} still has rows`).toBe(0);
    }

    // Children, which carry only a parent id — the cascade has to reach them too.
    for (const id of childIds) {
      const tables = [
        "topics",
        "note_revisions",
        "quiz_questions",
        "flashcards",
        "session_steps",
        "plan_blocks",
        "quest_steps",
      ];
      for (const table of tables) {
        expect(await count(db, table, `id = '${id}'`), `${table} ${id} survived`).toBe(0);
      }
    }
    expect(await count(db, "flashcard_reviews")).toBe(0);
    expect(await count(db, "task_recurrences")).toBe(0);

    // The account and the profile row both survive, in a blank, first-run state.
    expect(await count(db, "user", `id = '${alice.authUserId}'`)).toBe(1);
    expect(await count(db, "session", `user_id = '${alice.authUserId}'`)).toBe(1);
    const [profile] = await db.orm.select().from(users).where(eq(users.id, alice.id));
    expect(profile?.authUserId).toBe(alice.authUserId);
    expect(profile?.displayName).toBe("Alice");
    expect(profile?.settings).toEqual({});

    // Bob keeps everything, search rows included.
    expect(await count(db, "subjects", `user_id = '${bob.id}'`)).toBe(1);
    expect(await count(db, "notes", `user_id = '${bob.id}'`)).toBe(1);
    expect(
      await count(
        db,
        "topics",
        `subject_id in (select id from subjects where user_id = '${bob.id}')`,
      ),
    ).toBe(1);
    expect(await count(db, "search_index", `user_id = '${bob.id}'`)).toBe(bobSearchRows);

    // Bytes are not transactional: the attachment file went with the rows.
    expect(report.files).toBe(1);
    expect(report.filesFailed).toBe(0);
    expect(report.scope).toBe("data");
    expect(deletedFiles).toContain("local/alice/diagram.png");
  });

  it("takes the sign-in with it when the account itself is deleted", async () => {
    const report = await eraseEverything(
      db,
      { id: carol.id, authUserId: carol.authUserId },
      files,
      { deleteAccount: true },
    );

    expect(await count(db, "user", `id = '${carol.authUserId}'`)).toBe(0);
    expect(await count(db, "session", `user_id = '${carol.authUserId}'`)).toBe(0);
    expect(await count(db, "account", `user_id = '${carol.authUserId}'`)).toBe(0);
    expect(await count(db, "users", `id = '${carol.id}'`)).toBe(0);
    expect(await count(db, "subjects", `user_id = '${carol.id}'`)).toBe(0);
    expect(report.scope).toBe("account");
    expect(deletedFiles).toContain("local/carol/cells.pdf");
  });
});

/**
 * Study Quest data model — PostgreSQL 17.
 * Conventions and full table list: docs/IMPLEMENTATION_PLAN.md section 18.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Better Auth's tables are re-exported so drizzle-kit sees them in one schema.
export * from "./auth.ts";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/* --- identity -----------------------------------------------------------
 * `auth_user_id` is text, not uuid: Better Auth generates its own string ids and
 * the profile row must not be blocked by a type mismatch on the auth side.
 * The unique index is what lets sign-in upsert the profile without duplicating it. */
export const users = pgTable(
  "users",
  {
    id: id(),
    authUserId: text("auth_user_id"),
    displayName: text("display_name").notNull().default(""),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    timezone: text("timezone").notNull().default("UTC"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_auth_user_id_idx").on(t.authUserId)],
);

/* --- structure --------------------------------------------------------- */
export const subjects = pgTable(
  "subjects",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    monogram: text("monogram").notNull(),
    icon: text("icon"),
    orderIndex: integer("order_index").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("subjects_user_idx").on(t.userId)],
);

export const topics = pgTable(
  "topics",
  {
    id: id(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    orderIndex: integer("order_index").notNull().default(0),
    status: text("status").notNull().default("not_started"),
    progressCache: real("progress_cache").notNull().default(0),
    lastStudiedAt: timestamp("last_studied_at", { withTimezone: true }),
  },
  (t) => [index("topics_subject_idx").on(t.subjectId)],
);

/* --- files (ADR-027: metadata in Postgres, bytes in R2 or local disk) --- */
export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    noteId: uuid("note_id"),
    topicId: uuid("topic_id"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    bytes: integer("bytes").notNull(),
    storageProvider: text("storage_provider").notNull().default("local"),
    objectKey: text("object_key").notNull(),
    sha256: text("sha256"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("attachments_object_key_idx").on(t.objectKey)],
);

/* --- notes and AI ------------------------------------------------------- */
export const notes = pgTable(
  "notes",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
    title: text("title").notNull().default(""),
    bodyMd: text("body_md").notNull().default(""),
    wordCount: integer("word_count").notNull().default(0),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notes_topic_idx").on(t.topicId), index("notes_user_idx").on(t.userId)],
);

export const noteRevisions = pgTable(
  "note_revisions",
  {
    id: id(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    bodyMd: text("body_md").notNull(),
    savedAt: createdAt(),
  },
  (t) => [index("note_revisions_note_idx").on(t.noteId)],
);

export const aiArtifacts = pgTable(
  "ai_artifacts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    inputHash: text("input_hash").notNull(),
    options: jsonb("options").$type<Record<string, unknown>>().notNull().default({}),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    outputJson: jsonb("output_json").$type<Record<string, unknown> | null>(),
    outputText: text("output_text"),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costCents: integer("cost_cents").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    // Deliberately a plain index, not unique. Regenerate (`fresh`) produces a second
    // answer for the *same* key on purpose, the daily cap counts generations by counting
    // rows, and a unique constraint here turned every Regenerate — and any two identical
    // requests racing each other — into a 500 rather than a second row. `findCached`
    // already reads the newest row, so more than one is what it is written for.
    index("ai_artifacts_cache_idx").on(
      t.kind,
      t.sourceId,
      t.inputHash,
      t.promptVersion,
      t.provider,
      t.model,
    ),
  ],
);

/* --- practice ------------------------------------------------------------ */
export const quizzes = pgTable(
  "quizzes",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
    sourceNoteId: uuid("source_note_id").references(() => notes.id, { onDelete: "set null" }),
    title: text("title").notNull().default(""),
    questionCount: integer("question_count").notNull().default(10),
    difficulty: text("difficulty").notNull().default("medium"),
    status: text("status").notNull().default("ready"),
    createdAt: createdAt(),
  },
  (t) => [index("quizzes_user_idx").on(t.userId)],
);

export const quizQuestions = pgTable(
  "quiz_questions",
  {
    id: id(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    type: text("type").notNull().default("mcq"),
    prompt: text("prompt").notNull(),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    correctAnswer: text("correct_answer").notNull(),
    explanation: text("explanation"),
    difficulty: text("difficulty").notNull().default("medium"),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
    conceptTag: text("concept_tag"),
  },
  (t) => [index("quiz_questions_quiz_idx").on(t.quizId)],
);

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: id(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: text("mode").notNull().default("original"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    score: integer("score").notNull().default(0),
    total: integer("total").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
  },
  (t) => [index("quiz_attempts_user_idx").on(t.userId)],
);

export const questionMastery = pgTable(
  "question_mastery",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "cascade" }),
    conceptTag: text("concept_tag").notNull().default(""),
    attempts: integer("attempts").notNull().default(0),
    correct: integer("correct").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    mastery: real("mastery").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.topicId, t.conceptTag] })],
);

export const flashcardDecks = pgTable("flashcard_decks", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
  sourceNoteId: uuid("source_note_id").references(() => notes.id, { onDelete: "set null" }),
  title: text("title").notNull().default(""),
  createdAt: createdAt(),
});

export const flashcards = pgTable(
  "flashcards",
  {
    id: id(),
    deckId: uuid("deck_id")
      .notNull()
      .references(() => flashcardDecks.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
    front: text("front").notNull(),
    back: text("back").notNull(),
    ease: real("ease").notNull().default(2.5),
    intervalDays: integer("interval_days").notNull().default(0),
    repetitions: integer("repetitions").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    dueAt: timestamp("due_at", { withTimezone: true }),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  },
  (t) => [index("flashcards_due_idx").on(t.dueAt)],
);

export const flashcardReviews = pgTable("flashcard_reviews", {
  id: id(),
  flashcardId: uuid("flashcard_id")
    .notNull()
    .references(() => flashcards.id, { onDelete: "cascade" }),
  rating: text("rating").notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
  durationMs: integer("duration_ms").notNull().default(0),
});

/* --- organisation -------------------------------------------------------- */
export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "set null" }),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
    kind: text("kind").notNull().default("assignment"),
    priority: text("priority").notNull().default("normal"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    estimateMin: integer("estimate_min").notNull().default(0),
    notes: text("notes"),
    status: text("status").notNull().default("open"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("tasks_user_idx").on(t.userId), index("tasks_due_idx").on(t.dueAt)],
);

export const taskRecurrences = pgTable("task_recurrences", {
  id: id(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  freq: text("freq").notNull().default("weekly"),
  interval: integer("interval").notNull().default(1),
  byWeekday: text("by_weekday").notNull().default(""),
  untilAt: timestamp("until_at", { withTimezone: true }),
  nextAt: timestamp("next_at", { withTimezone: true }),
});

export const studySessions = pgTable(
  "study_sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "set null" }),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    mode: text("mode").notNull().default("quick"),
    plannedMin: integer("planned_min").notNull().default(0),
    focusMin: integer("focus_min").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    status: text("status").notNull().default("active"),
  },
  (t) => [index("study_sessions_user_idx").on(t.userId)],
);

export const sessionSteps = pgTable("session_steps", {
  id: id(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => studySessions.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull().default(0),
  kind: text("kind").notNull(),
  refType: text("ref_type"),
  refId: uuid("ref_id"),
  status: text("status").notNull().default("pending"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

/* --- planning and quests -------------------------------------------------- */
export const plans = pgTable("plans", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  mode: text("mode").notNull().default("suggested"),
  status: text("status").notNull().default("draft"),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
});

export const planBlocks = pgTable("plan_blocks", {
  id: id(),
  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull().default(0),
  kind: text("kind").notNull(),
  refId: uuid("ref_id"),
  plannedMin: integer("planned_min").notNull().default(0),
  status: text("status").notNull().default("pending"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const quests = pgTable(
  "quests",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("topic"),
    scopeType: text("scope_type"),
    scopeId: uuid("scope_id"),
    xpReward: integer("xp_reward").notNull().default(0),
    status: text("status").notNull().default("active"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("quests_user_idx").on(t.userId)],
);

export const questSteps = pgTable("quest_steps", {
  id: id(),
  questId: uuid("quest_id")
    .notNull()
    .references(() => quests.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull().default(0),
  title: text("title").notNull(),
  kind: text("kind").notNull(),
  refType: text("ref_type"),
  refId: uuid("ref_id"),
  required: boolean("required").notNull().default(true),
  status: text("status").notNull().default("pending"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

/* --- gamification --------------------------------------------------------- */
export const xpLedger = pgTable(
  "xp_ledger",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    createdAt: createdAt(),
  },
  // Idempotent awarding: a retry or double-click can never inflate XP (ADR-015).
  (t) => [uniqueIndex("xp_ledger_idempotent_idx").on(t.userId, t.reason, t.sourceType, t.sourceId)],
);

export const levels = pgTable("levels", {
  level: integer("level").primaryKey(),
  xpRequired: integer("xp_required").notNull(),
  title: text("title").notNull(),
});

export const achievements = pgTable("achievements", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon"),
  criteria: jsonb("criteria").$type<Record<string, unknown>>().notNull().default({}),
  xpReward: integer("xp_reward").notNull().default(0),
  hidden: boolean("hidden").notNull().default(false),
});

export const userAchievements = pgTable("user_achievements", {
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  achievementCode: text("achievement_code")
    .notNull()
    .references(() => achievements.code, { onDelete: "cascade" }),
  progress: integer("progress").notNull().default(0),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
});

export const streaks = pgTable("streaks", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  current: integer("current").notNull().default(0),
  longest: integer("longest").notNull().default(0),
  lastActiveDate: text("last_active_date"),
  freezeCount: integer("freeze_count").notNull().default(0),
});

/* --- platform -------------------------------------------------------------- */
export const reminders = pgTable("reminders", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  refType: text("ref_type"),
  refId: uuid("ref_id"),
  fireAt: timestamp("fire_at", { withTimezone: true }).notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  channel: text("channel").notNull().default("in_app"),
  enabled: boolean("enabled").notNull().default(true),
});

export const activityLog = pgTable("activity_log", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  refType: text("ref_type"),
  refId: uuid("ref_id"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});

/** Full-text search (ADR-013): tsvector + trigram, maintained by triggers. */
export const searchIndex = pgTable("search_index", {
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  title: text("title").notNull().default(""),
  body: text("body").notNull().default(""),
  subjectId: uuid("subject_id"),
  topicId: uuid("topic_id"),
});

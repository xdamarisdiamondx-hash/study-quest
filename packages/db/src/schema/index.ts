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
  type AnyPgColumn,
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
    /** A retry points at the quiz whose mistakes produced it (P8, PRD §13). */
    retryOf: uuid("retry_of").references((): AnyPgColumn => quizzes.id, {
      onDelete: "set null",
    }),
    /** The concepts a retry targets — "Retry: Momentum" on the results screen. */
    focusTags: jsonb("focus_tags").$type<string[]>().notNull().default([]),
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

/** One submitted answer as attempts store it — graded at submit time, kept for review (P8). */
export interface StoredQuizAnswer {
  questionId: string;
  answer: string;
  verdict: "correct" | "incorrect" | "needs_review";
  /** The verdict after any self-mark: what the score counted. */
  correct: boolean;
}

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
    /** Everything the student submitted, so any attempt can be re-reviewed later. */
    answers: jsonb("answers").$type<StoredQuizAnswer[]>().notNull().default([]),
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
    // Cards have no order column; creation order is the order they were saved in,
    // and a bulk import stamps millisecond offsets so the pasted order survives.
    createdAt: createdAt(),
  },
  (t) => [index("flashcards_due_idx").on(t.dueAt)],
);

export const flashcardReviews = pgTable(
  "flashcard_reviews",
  {
    id: id(),
    flashcardId: uuid("flashcard_id")
      .notNull()
      .references(() => flashcards.id, { onDelete: "cascade" }),
    /** The study session this rating belonged to — see the unique index below. */
    batchId: uuid("batch_id").notNull(),
    rating: text("rating").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
    durationMs: integer("duration_ms").notNull().default(0),
  },
  (t) => [
    // One card rated once per batch: a re-posted batch (retry, double-click,
    // flush after crash) skips the rows it already applied instead of running
    // the schedule over them a second time.
    uniqueIndex("flashcard_reviews_batch_card_idx").on(t.batchId, t.flashcardId),
  ],
);

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
    /**
     * Every row of a recurring series — head included — points at its rule. Deleting a
     * single row skips that occurrence; deleting the rule row deletes the series (P11).
     */
    recurrenceId: uuid("recurrence_id").references((): AnyPgColumn => taskRecurrences.id, {
      onDelete: "cascade",
    }),
  },
  (t) => [
    index("tasks_user_idx").on(t.userId),
    index("tasks_due_idx").on(t.dueAt),
    index("tasks_recurrence_idx").on(t.recurrenceId),
  ],
);

export const taskRecurrences = pgTable("task_recurrences", {
  id: id(),
  taskId: uuid("task_id")
    .notNull()
    .references((): AnyPgColumn => tasks.id, { onDelete: "cascade" }),
  /**
   * The date the series was born on — the anchor occurrence math counts from. Kept on
   * the rule (not read from `taskId`'s row) so skipping the first occurrence cannot
   * shift the phase of every later one (P11, ADR-017).
   */
  anchorAt: timestamp("anchor_at", { withTimezone: true }).notNull(),
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
  /** The stage's own words — named from the topic's actual material (P14). */
  title: text("title").notNull().default(""),
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
  // Count steps (P13): "complete 5 study sessions this week" completes by
  // reaching its target, not by a single event. target=1 means "one event",
  // which is what every other step kind is.
  target: integer("target").notNull().default(1),
  progress: integer("progress").notNull().default(0),
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
    // Opaque source key: a row id where the source has one (attempt, session,
    // step), a stable code where it does not (an achievement's code) — P15.
    sourceId: text("source_id").notNull(),
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

export const userAchievements = pgTable(
  "user_achievements",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    achievementCode: text("achievement_code")
      .notNull()
      .references(() => achievements.code, { onDelete: "cascade" }),
    progress: integer("progress").notNull().default(0),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
  },
  // One row per achievement per user: P15 upserts progress on every read.
  (t) => [primaryKey({ columns: [t.userId, t.achievementCode] })],
);

export const streaks = pgTable("streaks", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  current: integer("current").notNull().default(0),
  longest: integer("longest").notNull().default(0),
  lastActiveDate: text("last_active_date"),
  freezeCount: integer("freeze_count").notNull().default(0),
});

/**
 * "Not today" on a recommendation (P17): one row per dismissed rule per day, so
 * the decline survives a refresh and expires with the date instead of with the
 * session — the same rule plan dismissals follow (A.8).
 */
export const recommendationDismissals = pgTable(
  "recommendation_dismissals",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The rule's code — one row dismisses exactly that suggestion. */
    code: text("code").notNull(),
    /** The plan day key (localDate): a new day is a new card. */
    day: text("day").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("rec_dismiss_user_code_day_idx").on(t.userId, t.code, t.day)],
);

/* --- platform -------------------------------------------------------------- */
/**
 * P18 notification centre rows. Title/body/href are the copy frozen at the slot
 * (ADR-016's history exception — the centre shows what was actually said);
 * snoozedUntil feeds the redelivery tick, readAt marks the bell seen.
 */
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
  /** Snapshot of the sentence delivered, kept for the centre's history. */
  title: text("title").notNull().default(""),
  body: text("body").notNull().default(""),
  href: text("href").notNull().default(""),
  readAt: timestamp("read_at", { withTimezone: true }),
  /** Snooze sets this to now+30m and clears deliveredAt; the tick redelivers. */
  snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
});

/**
 * P18 student controls (§28): per-type switches and quiet hours. A missing row
 * is the default — everything on, 22:00–07:00 quiet (ADR-017's local scheduler
 * keeps time in the student's clock, not the server's).
 */
export const reminderSettings = pgTable("reminder_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Overrides only: a type absent from this map is on. */
  enabled: jsonb("enabled").$type<Partial<Record<string, boolean>>>().notNull().default({}),
  quietStart: text("quiet_start").notNull().default("22:00"),
  quietEnd: text("quiet_end").notNull().default("07:00"),
  createdAt: createdAt(),
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

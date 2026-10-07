/**
 * What's next (P17, PRD §27): one read that feeds both surfaces the plan asks
 * for — the Home "What's next" card and the strip that follows a completed
 * activity — from signals the server already keeps elsewhere. Nothing here
 * invents state: deadlines come from the task rows, quiet topics and mastery
 * from the same snapshots the plan generator uses, the streak from its table,
 * the day's remainder from the plan itself (ADR-016: computed on read).
 *
 * Anti-spam is decided here, not in the UI: the pure engine returns at most
 * three by deterministic score, and dismissal rows are applied *after* the cap
 * — "Not today" shows one fewer card and never summons a replacement, so a
 * suggestion cannot nag its way back through the back door. A first-run
 * account has no activity row, so the rules that nudge a returning student
 * stay silent (the engine's `everStudied` gate).
 */
import { and, desc, eq, isNotNull } from "drizzle-orm";

import {
  localDate,
  recommend,
  type AttemptSignal,
  type DaySignal,
  type QuestSignal,
  type RecommendContext,
  type RecommendationCode,
} from "@sq/core/planning";
import {
  activityLog,
  planBlocks,
  plans,
  quizAttempts,
  quizzes,
  recommendationDismissals,
} from "@sq/db/schema";

import { db } from "../db.ts";
import { listQuests, type QuestView } from "./quests.ts";
import { openTaskSnapshots, ownedTopicIds, topicSnapshots } from "./planning.ts";
import { loadStreak } from "./xp.ts";

/** What the UI reads — the engine's score stays server-side. */
export interface SuggestionView {
  code: RecommendationCode;
  text: string;
  action: string;
  href: string;
}

export interface RecommendationsView {
  suggestions: SuggestionView[];
  generatedAt: string;
}

/** Latest graded attempt per topic, newest first — the engine picks the recent weak one. */
async function latestAttempts(profileId: string): Promise<AttemptSignal[]> {
  const rows = await db.orm
    .select({
      topicId: quizzes.topicId,
      score: quizAttempts.score,
      total: quizAttempts.total,
      completedAt: quizAttempts.completedAt,
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
    .where(and(eq(quizAttempts.userId, profileId), isNotNull(quizAttempts.completedAt)))
    .orderBy(desc(quizAttempts.completedAt));

  const seen = new Set<string>();
  const out: AttemptSignal[] = [];
  for (const row of rows) {
    if (row.total <= 0 || row.completedAt === null || !row.topicId) continue;
    if (seen.has(row.topicId)) continue;
    seen.add(row.topicId);
    out.push({
      topicId: row.topicId,
      score: row.score,
      total: row.total,
      completedAt: row.completedAt.toISOString(),
    });
  }
  return out;
}

/** Any real work on record — first-run accounts have no row, so nudges stay off. */
async function hasStudied(profileId: string): Promise<boolean> {
  const rows = await db.orm
    .select({ id: activityLog.id })
    .from(activityLog)
    .where(eq(activityLog.userId, profileId))
    .limit(1);
  return rows.length > 0;
}

/** Today's plan as a remainder count; no plan row yet means no quest to finish. */
async function daySignal(profileId: string, date: string): Promise<DaySignal | null> {
  const [plan] = await db.orm
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.userId, profileId), eq(plans.date, date)))
    .limit(1);
  if (!plan) return null;

  const blocks = await db.orm
    .select({ status: planBlocks.status })
    .from(planBlocks)
    .where(eq(planBlocks.planId, plan.id));
  const pending = blocks.filter((b) => b.status === "pending").length;
  const total = blocks.filter((b) => b.status !== "dismissed").length;
  return { pending, total };
}

/** Codes dismissed for today (A.8's rule: a declined suggestion expires with the date). */
async function dismissedCodes(profileId: string, date: string): Promise<Set<string>> {
  const rows = await db.orm
    .select({ code: recommendationDismissals.code })
    .from(recommendationDismissals)
    .where(
      and(eq(recommendationDismissals.userId, profileId), eq(recommendationDismissals.day, date)),
    );
  return new Set(rows.map((r) => r.code));
}

/** The active quest worth continuing: most steps done, but not finished. */
function questSignal(questRows: readonly QuestView[]): QuestSignal | null {
  let best: QuestSignal | null = null;
  for (const quest of questRows) {
    const stepTotal = quest.steps.length;
    const stepDone = quest.steps.filter((s) => s.status === "done").length;
    if (stepTotal === 0 || stepDone >= stepTotal) continue;
    if (!best || stepDone > best.stepDone) {
      best = { title: quest.title, href: `/quests?quest=${quest.id}`, stepDone, stepTotal };
    }
  }
  return best;
}

export async function recommendationsView(
  profileId: string,
  context: RecommendContext,
): Promise<RecommendationsView> {
  const now = new Date();
  const date = localDate(now);

  const [tasks, topicIds, streak, studied, attempts, questRows, day, dismissed] = await Promise.all(
    [
      openTaskSnapshots(profileId),
      ownedTopicIds(profileId),
      loadStreak(profileId),
      hasStudied(profileId),
      latestAttempts(profileId),
      listQuests(profileId),
      daySignal(profileId, date),
      dismissedCodes(profileId, date),
    ],
  );
  const topicRows = await topicSnapshots(profileId, topicIds, now);

  const ranked = recommend(
    {
      now,
      tasks,
      topicsById: Object.fromEntries(topicRows),
      attempts,
      studiedToday: streak.lastActiveDate === date,
      streak: streak.current,
      everStudied: studied,
      quest: questSignal(questRows.active),
      day,
    },
    context,
  );

  const suggestions = ranked
    .filter((r) => !dismissed.has(r.code))
    .map((r) => ({ code: r.code, text: r.text, action: r.action, href: r.href }));

  return { suggestions, generatedAt: now.toISOString() };
}

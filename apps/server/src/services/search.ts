/**
 * Search (P19, PRD §29): the two-phase read that feeds `rankSearch`.
 *
 * Phase 1 walks the stored `tsvector` — GIN-indexed, prefix matching, ranked by
 * `ts_rank` — so the common query never scans. Phase 2 is the typo net: when
 * phase 1 comes back thin, it pulls a bounded, deterministic slice of the
 * student's index (ordered by type and id, so the same query always truncates
 * the same way) and lets `scoreMatch` find near-misses a prefix query cannot
 * ("Nuton" → "Newton"). PGlite has no `pg_trgm` (PRD A.8), so this is where
 * fuzzy matching lives — bounded, and only when the fast path under-delivered.
 *
 * Every query is scoped to `user_id` and skips content whose subject is
 * archived; recents are one upserted row per normalized key, capped at eight.
 */
import { and, desc, eq, notInArray, sql, type SQL } from "drizzle-orm";

import {
  buildTsQuery,
  normalizeQuery,
  rankSearch,
  recentKey,
  SEARCH_TYPES,
  type SearchHit,
  type SearchRow,
  type SearchType,
} from "@sq/core/search";
import { recentSearches } from "@sq/db/schema";

import { db } from "../db.ts";

export interface SearchParams {
  q: string;
  type: SearchType | null;
  subjectId: string | null;
}

export interface SearchView {
  query: string;
  results: SearchHit[];
  total: number;
}

export interface RecentSearch {
  query: string;
  at: string;
}

/** Fewer than this from the indexed phase means the fast path under-delivered. */
const FUZZY_THRESHOLD = 10;
/** The typo scan's ceiling — deterministic (ordered) so truncation is stable. */
const FUZZY_POOL = 3000;

type IndexRow = SearchRow & { tsRank?: number | string | null };

async function run(query: SQL): Promise<IndexRow[]> {
  // drizzle's raw `execute` answers with the driver's result object on one
  // driver and a bare row array on the other — accept both.
  const out = (await db.orm.execute(query)) as unknown;
  if (Array.isArray(out)) return out as IndexRow[];
  const rows = (out as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as IndexRow[]) : [];
}

function filterClauses(profileId: string, params: SearchParams): SQL[] {
  const clauses: SQL[] = [sql`si.user_id = ${profileId}`];
  if (params.type) clauses.push(sql`si.entity_type = ${params.type}`);
  if (params.subjectId) clauses.push(sql`si.subject_id = ${params.subjectId}`);
  // An archived subject's rows may still sit in the index (archiving is
  // reversible) — they simply never answer.
  clauses.push(sql`(si.subject_id IS NULL OR s.archived_at IS NULL)`);
  return clauses;
}

const SELECT_COLUMNS = sql`
  si.entity_type AS "type",
  si.entity_id AS "id",
  si.title,
  left(si.body, 1200) AS "body",
  si.subject_id AS "subjectId",
  si.topic_id AS "topicId",
  fc.deck_id AS "deckId",
  s.name AS "subjectName",
  tp.name AS "topicName"`;

// The flashcards join resolves a *card* row to its deck (deck rows miss it and
// carry null) so a card result's href can deep-link `&deck=` and the panel
// opens straight into the right deck (P19 jump-to-highlight).
const FROM_JOINS = sql`
  FROM search_index si
  LEFT JOIN subjects s ON s.id = si.subject_id
  LEFT JOIN topics tp ON tp.id = si.topic_id
  LEFT JOIN flashcards fc ON si.entity_type = 'flashcard' AND fc.id = si.entity_id`;

function isIndexRow(row: IndexRow): row is IndexRow & { type: SearchType } {
  return (SEARCH_TYPES as readonly string[]).includes(String(row.type));
}

export async function searchView(profileId: string, params: SearchParams): Promise<SearchView> {
  const query = normalizeQuery(params.q);
  const tsq = buildTsQuery(query);
  if (!tsq) return { query, results: [], total: 0 };

  const where = and(...filterClauses(profileId, params));
  const phase1 = await run(sql`
    SELECT ${SELECT_COLUMNS},
    ts_rank(si.tsv, to_tsquery('english', ${tsq})) AS "tsRank"
    ${FROM_JOINS}
    WHERE ${where} AND si.tsv @@ to_tsquery('english', ${tsq})
    ORDER BY "tsRank" DESC, si.entity_type, si.entity_id
    LIMIT 150`);

  const rows: IndexRow[] = phase1.filter(isIndexRow);
  if (rows.length < FUZZY_THRESHOLD) {
    const seen = new Set(rows.map((r) => `${r.type}:${r.id}`));
    const phase2 = await run(sql`
      SELECT ${SELECT_COLUMNS},
      NULL AS "tsRank"
      ${FROM_JOINS}
      WHERE ${where}
      ORDER BY si.entity_type, si.entity_id
      LIMIT ${FUZZY_POOL}`);
    for (const row of phase2) {
      if (!isIndexRow(row)) continue;
      const key = `${row.type}:${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }

  const hits = rankSearch(
    query,
    rows.map((r) => ({
      ...r,
      tsRank: r.tsRank == null ? null : Number(r.tsRank),
    })),
    100,
  );
  return { query, results: hits.slice(0, 30), total: hits.length };
}

export async function recentList(profileId: string): Promise<RecentSearch[]> {
  const rows = await db.orm
    .select({ query: recentSearches.query, ranAt: recentSearches.ranAt })
    .from(recentSearches)
    .where(eq(recentSearches.userId, profileId))
    .orderBy(desc(recentSearches.ranAt))
    .limit(8);
  return rows.map((r) => ({ query: r.query, at: r.ranAt.toISOString() }));
}

/** Upsert by normalized key, then trim to the newest eight. */
export async function recentSave(profileId: string, raw: unknown): Promise<void> {
  const display = normalizeQuery(raw);
  const key = recentKey(display);
  if (!key) return;
  await db.orm
    .insert(recentSearches)
    .values({ userId: profileId, key, query: display, ranAt: new Date() })
    .onConflictDoUpdate({
      target: [recentSearches.userId, recentSearches.key],
      set: { query: display, ranAt: new Date() },
    });
  const keep = db.orm
    .select({ key: recentSearches.key })
    .from(recentSearches)
    .where(eq(recentSearches.userId, profileId))
    .orderBy(desc(recentSearches.ranAt))
    .limit(8);
  await db.orm
    .delete(recentSearches)
    .where(and(eq(recentSearches.userId, profileId), notInArray(recentSearches.key, keep)));
}

export async function recentClear(profileId: string): Promise<void> {
  await db.orm.delete(recentSearches).where(eq(recentSearches.userId, profileId));
}

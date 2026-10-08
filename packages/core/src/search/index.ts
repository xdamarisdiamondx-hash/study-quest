/**
 * Search matching, ranking and excerpts (P19, PRD §29) — pure, no I/O.
 *
 * The database does the first pass: a stored `tsvector` column finds prefix
 * matches ("Newt" finds "Newton") and ranks them with `ts_rank`. This module is
 * the layer that makes those results and the typo-fallback results look the
 * same: it turns a typed string into a safe tsquery, scores every candidate on
 * one deterministic scale, picks the excerpt around the first hit and builds
 * the marked-up segments the UI renders as <mark>.
 *
 * Typo tolerance lives here rather than in `pg_trgm` (ADR-013's extension)
 * because PGlite — the local driver the app actually runs on — does not ship
 * it. A bigram score over a bounded candidate set keeps the promise ("Nuton"
 * finds "Newton") on every driver. See PRD A.8.
 */

/** The seven result types PRD §29 lists, in the order they group. */
export const SEARCH_TYPES = [
  "subject",
  "topic",
  "note",
  "task",
  "quiz",
  "flashcard",
  "quest",
] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export const SEARCH_TYPE_LABELS: Record<SearchType, string> = {
  subject: "Subjects",
  topic: "Topics",
  note: "Notes",
  task: "Tasks",
  quiz: "Quizzes",
  flashcard: "Flashcards",
  quest: "Quests",
};

export interface Segment {
  text: string;
  hit: boolean;
}

/** One row of the search index as the server fetched it. */
export interface SearchRow {
  type: SearchType;
  id: string;
  title: string;
  body: string;
  subjectId: string | null;
  topicId: string | null;
  /** Denormalised names for the result's context line ("Physics · Motion"). */
  subjectName?: string | null;
  topicName?: string | null;
  /**
   * Flashcard *cards* carry the deck they live in (P19): a card result links
   * straight to its deck (`&deck=`) so the landing page can open it and
   * outline the card. Deck rows themselves leave this null.
   */
  deckId?: string | null;
  /** `ts_rank` when the row came from the indexed phase, else null. */
  tsRank?: number | null;
}

export interface SearchHit {
  type: SearchType;
  id: string;
  title: string;
  /** "Subject · Topic", as much as the row knows. */
  context: string | null;
  titleSegments: Segment[];
  /** Excerpt of the body with the match marked; null when there is no body. */
  bodySegments: Segment[] | null;
  href: string;
  score: number;
}

/** Trim, collapse whitespace, cap length. Keeps the student's casing for display. */
export function normalizeQuery(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * Lowercase alphanumeric tokens — diacritics folded so "café" searches "cafe",
 * punctuation splitting rather than searching ("newton's" → "newton"). Length
 * two and up: the leftover `s` of a possessive would AND a lexeme the english
 * parser never stores, failing the whole query. Deduplicated in order so a
 * repeated word does not count twice in coverage.
 */
export function searchTokens(raw: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of normalizeQuery(raw)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)) {
    if (t.length < 2 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * A `to_tsquery` string: every token AND'd with prefix matching, so typing
 * "newt" matches the "newton" lexeme and multi-word queries stay strict.
 * Tokens are already alphanumeric, so nothing here can inject into the query
 * language; the cap keeps one very long paste from building a monster query.
 */
export function buildTsQuery(raw: unknown): string | null {
  const tokens = searchTokens(raw).slice(0, 8);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `${t}:*`).join(" & ");
}

/** Bigrams of a word, the unit the Dice coefficient compares. */
export function bigrams(word: string): string[] {
  const w = word.toLowerCase();
  if (w.length < 2) return w.length === 1 ? [w] : [];
  const out: string[] = [];
  for (let i = 0; i < w.length - 1; i += 1) out.push(w.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice over bigrams: 1 = identical, 0 = nothing shared. */
export function dice(a: string, b: string): number {
  const aa = bigrams(a);
  const bb = bigrams(b);
  if (aa.length === 0 || bb.length === 0) return a.toLowerCase() === b.toLowerCase() ? 1 : 0;
  const counts = new Map<string, number>();
  for (const g of aa) counts.set(g, (counts.get(g) ?? 0) + 1);
  let shared = 0;
  for (const g of bb) {
    const left = counts.get(g) ?? 0;
    if (left > 0) {
      shared += 1;
      counts.set(g, left - 1);
    }
  }
  return (2 * shared) / (aa.length + bb.length);
}

/**
 * One query word against one target word, 0–1.
 *
 * exact > prefix ("newt" → "newton") > trailing typo ("newtonz" → "newton")
 * > infix ("ewton" → "newton") > near-miss ("nuton" → "Newton"). The fuzzy
 * branch demands similar length and at least 0.4 bigram overlap, which rejects
 * "math" vs "mass" while accepting single-substitution and single-transposition
 * typos.
 */
export function wordScore(queryWord: string, targetWord: string): number {
  const q = queryWord.toLowerCase();
  const t = targetWord.toLowerCase();
  if (!q || !t) return 0;
  if (q === t) return 1;
  if (q.length >= 2 && t.startsWith(q)) return 0.82 + 0.16 * (q.length / t.length);
  if (q.length >= 3 && t.includes(q)) return 0.72;
  if (t.length >= 4 && q.startsWith(t)) return 0.78;
  if (q.length >= 3 && t.length >= 3 && Math.abs(q.length - t.length) <= 2) {
    const d = dice(q, t);
    if (d >= 0.4) return 0.4 + 0.4 * d;
  }
  return 0;
}

/**
 * A word scored as itself and, when it ends in `'s`, without it: the
 * possessive adds two characters and would defeat `wordScore`'s length guard
 * on exactly the near-miss queries that matter ("newtn" vs "Newton's").
 */
function wordVariants(word: string): string[] {
  const bare = word.replace(/'s$/i, "");
  return bare === word || bare.length < 3 ? [word] : [word, bare];
}

/** Best score of a query token against one word in any of its variants. */
function wordScoreAny(token: string, word: string): number {
  let best = 0;
  for (const variant of wordVariants(word)) {
    const s = wordScore(token, variant);
    if (s > best) best = s;
  }
  return best;
}

/**
 * Score one candidate row, 0 and up. Every token must find something
 * (coverage), the average sets the level, and title placement, an exact title
 * and the indexed `ts_rank` add the deciding weight — a title hit always beats
 * a body hit, an exact title beats everything.
 */
export function scoreMatch(
  rawQuery: unknown,
  title: string,
  body: string,
  tsRank?: number | null,
): number {
  const tokens = searchTokens(rawQuery);
  if (tokens.length === 0) return 0;
  const queryNorm = tokens.join(" ");
  const titleLower = title.toLowerCase();
  const titleWords = titleLower.split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  const bodyLower = body.toLowerCase();
  const bodyWords = bodyLower.split(/[^\p{L}\p{N}']+/u).filter(Boolean);

  let sum = 0;
  let hits = 0;
  for (const tok of tokens) {
    let best = 0;
    for (const w of titleWords) {
      const s = wordScoreAny(tok, w);
      if (s > best) best = s;
      if (best === 1) break;
    }
    if (best === 0) {
      if (bodyLower.includes(tok)) {
        best = 0.5;
      } else {
        for (const w of bodyWords) {
          const s = wordScoreAny(tok, w);
          // Near-miss words in a body count below an exact substring: bodies
          // are long, so the accidental look-alike is common, and an exact hit
          // elsewhere must keep its edge.
          if (s > 0) best = Math.max(best, Math.min(s * 0.9, 0.48));
          if (best >= 0.48) break;
        }
      }
    }
    if (best > 0) hits += 1;
    sum += best;
  }
  if (hits === 0) return 0;

  const coverage = hits / tokens.length;
  const score = (sum / tokens.length) * (0.55 + 0.45 * coverage);
  const rankBonus = tsRank ? Math.min(tsRank, 0.6) * 0.25 : 0;
  const titleBonus = titleLower === queryNorm ? 0.35 : titleLower.startsWith(queryNorm) ? 0.18 : 0;
  return Math.round((score + rankBonus + titleBonus) * 1000) / 1000;
}

function firstHitOffset(query: unknown, text: string): number | null {
  const lower = text.toLowerCase();
  let best: number | null = null;
  const consider = (at: number) => {
    if (at >= 0 && (best === null || at < best)) best = at;
  };
  const words: { word: string; at: number }[] = [];
  const re = /[\p{L}\p{N}']+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) words.push({ word: m[0], at: m.index });
  for (const tok of searchTokens(query)) {
    consider(lower.indexOf(tok));
    for (const { word, at } of words) {
      if (wordScoreAny(tok, word) >= 0.55) {
        consider(at);
        break;
      }
    }
  }
  return best;
}

/**
 * A window of `text` around the first hit, with ellipses where it was cut.
 * Falls back to the opening so a title-only match still gets a preview line.
 */
export function excerptAround(rawQuery: unknown, text: string, maxChars = 200): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  const hit = firstHitOffset(rawQuery, clean);
  const start = hit === null ? 0 : Math.max(0, hit - Math.floor(maxChars / 3));
  const end = Math.min(clean.length, start + maxChars);
  const slice = clean.slice(start, end).trim();
  return `${start > 0 ? "…" : ""}${slice}${end < clean.length ? "…" : ""}`;
}

/**
 * Split `text` into hit and non-hit segments for <mark> rendering — no HTML,
 * no injection surface. Substring hits mark the typed letters; fuzzy hits mark
 * the whole word ("Nuton" highlights all of "Newton"). Overlapping ranges
 * merge so segments never interleave.
 */
export function buildSegments(rawQuery: unknown, text: string): Segment[] {
  if (!text) return [];
  const ranges: [number, number][] = [];
  const lower = text.toLowerCase();
  const words: { word: string; at: number }[] = [];
  const re = /[\p{L}\p{N}']+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) words.push({ word: m[0], at: m.index });
  for (const tok of searchTokens(rawQuery)) {
    const at = lower.indexOf(tok);
    if (at >= 0) {
      ranges.push([at, at + tok.length]);
      continue;
    }
    for (const { word, at: wordAt } of words) {
      if (wordScoreAny(tok, word) >= 0.55) {
        ranges.push([wordAt, wordAt + word.length]);
        break;
      }
    }
  }
  if (ranges.length === 0) return [{ text, hit: false }];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const segments: Segment[] = [];
  let at = 0;
  for (const [start, end] of merged) {
    if (start > at) segments.push({ text: text.slice(at, start), hit: false });
    segments.push({ text: text.slice(start, end), hit: true });
    at = end;
  }
  if (at < text.length) segments.push({ text: text.slice(at), hit: false });
  return segments;
}

/**
 * Where a result of this type lives (P13 tabs, P17's `?quest=` focus pattern,
 * `?focus=<id>` for everything else — the pages outline the row they land on).
 */
export function hrefFor(
  type: SearchType,
  ids: {
    id: string;
    subjectId?: string | null;
    topicId?: string | null;
    /** Flashcard cards: the deck that holds them, so the page can open it. */
    deckId?: string | null;
  },
): string {
  const id = encodeURIComponent(ids.id);
  const subjectId = ids.subjectId ?? null;
  const topicId = ids.topicId ?? null;
  const focus = `focus=${id}`;
  switch (type) {
    case "subject":
      return `/study/${id}`;
    case "topic":
      return subjectId ? `/study/${subjectId}?tab=topics&${focus}` : "/study";
    case "note":
      if (subjectId && topicId) return `/study/${subjectId}/${topicId}/notes?${focus}`;
      return subjectId ? `/study/${subjectId}?tab=notes&${focus}` : "/study";
    case "quiz":
      return subjectId ? `/study/${subjectId}?tab=quizzes&${focus}` : "/study";
    case "flashcard": {
      if (!subjectId) return "/study";
      const deck = ids.deckId ? `&deck=${encodeURIComponent(ids.deckId)}` : "";
      return `/study/${subjectId}?tab=flashcards&${focus}${deck}`;
    }
    case "task":
      return `/tasks?${focus}`;
    case "quest":
      return `/quests?quest=${id}`;
  }
}

/**
 * Score, order and cap the candidates both phases produced. Order is total and
 * deterministic: score, then the §29 type order, then title, then id — two
 * runs of the same query always read the same.
 */
export function rankSearch(rawQuery: unknown, rows: SearchRow[], limit = 30): SearchHit[] {
  const query = normalizeQuery(rawQuery);
  if (!query) return [];
  const scored: { row: SearchRow; score: number }[] = [];
  for (const row of rows) {
    const score = scoreMatch(query, row.title, row.body, row.tsRank);
    if (score > 0.08) scored.push({ row, score });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const typeGap = SEARCH_TYPES.indexOf(a.row.type) - SEARCH_TYPES.indexOf(b.row.type);
    if (typeGap !== 0) return typeGap;
    const titleGap = a.row.title.localeCompare(b.row.title);
    if (titleGap !== 0) return titleGap;
    return a.row.id.localeCompare(b.row.id);
  });
  return scored.slice(0, limit).map(({ row, score }) => {
    const excerpt = row.body ? excerptAround(query, row.body) : "";
    const subjectName = row.subjectName?.trim() || null;
    const topicName = row.topicName?.trim() || null;
    const context =
      subjectName && topicName ? `${subjectName} · ${topicName}` : (subjectName ?? topicName);
    return {
      type: row.type,
      id: row.id,
      title: row.title,
      context,
      titleSegments: buildSegments(query, row.title),
      bodySegments: excerpt ? buildSegments(query, excerpt) : null,
      href: hrefFor(row.type, row),
      score,
    };
  });
}

/** Recents dedupe key: "Newton" and " newton " are one recent search. */
export function recentKey(raw: unknown): string {
  return searchTokens(raw).join(" ");
}

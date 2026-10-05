/**
 * Artifact cache (P6, ADR-008).
 *
 * Every AI result is stored against `(kind, source, input_hash, prompt_version, provider,
 * model)`. Re-generating a summary costs money and time for nothing, and hashing the note's
 * *content* into the key is what makes editing the note invalidate its own artifacts — the
 * staleness problem ADR-008 names, solved by construction rather than by a timer.
 */
import { createHash } from "node:crypto";

import { and, desc, eq, gte, sql } from "drizzle-orm";

import { aiArtifacts } from "@sq/db/schema";

import { db } from "../db.ts";

/** Stable JSON: keys sorted, so two objects with the same content hash the same. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** SHA-256 of the prompt input. Any edit to the source changes it. */
export function inputHash(input: unknown): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

export interface CacheKey {
  userId: string;
  kind: string;
  sourceId: string;
  hash: string;
  promptVersion: string;
}

export interface CachedRow {
  id: string;
  outputJson: Record<string, unknown> | null;
  outputText: string | null;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  createdAt: Date;
}

/**
 * Newest matching artifact, ignoring provider and model.
 *
 * The unique index includes them, but a lookup that spans providers is what lets a student
 * switch from Ollama to Groq and immediately see the summary they already paid for —
 * "switching providers changes no UI" applies to the cache too.
 */
export async function findCached(key: CacheKey): Promise<CachedRow | null> {
  const rows = await db.orm
    .select()
    .from(aiArtifacts)
    .where(
      and(
        eq(aiArtifacts.userId, key.userId),
        eq(aiArtifacts.kind, key.kind),
        eq(aiArtifacts.sourceId, key.sourceId),
        eq(aiArtifacts.inputHash, key.hash),
        eq(aiArtifacts.promptVersion, key.promptVersion),
      ),
    )
    .orderBy(desc(aiArtifacts.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) {
    console.log(`[ai] cache miss ${key.kind} ${key.promptVersion} ${key.hash.slice(0, 8)}`);
    return null;
  }

  console.log(
    `[ai] cache hit  ${key.kind} ${key.promptVersion} ${key.hash.slice(0, 8)} ` +
      `(${row.provider}/${row.model}, ${(row.createdAt as Date).toISOString().slice(0, 19)})`,
  );
  return { ...row, createdAt: row.createdAt as Date };
}

export interface StoreInput extends CacheKey {
  sourceType: string;
  provider: string;
  model: string;
  outputJson: Record<string, unknown> | null;
  outputText: string | null;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  options?: Record<string, unknown>;
}

/** Insert the artifact. Returns the row id so callers can reference it in the response. */
export async function storeArtifact(input: StoreInput): Promise<string> {
  const [row] = await db.orm
    .insert(aiArtifacts)
    .values({
      userId: input.userId,
      kind: input.kind,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      inputHash: input.hash,
      options: input.options ?? {},
      provider: input.provider,
      model: input.model,
      promptVersion: input.promptVersion,
      outputJson: input.outputJson,
      outputText: input.outputText,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      costCents: input.costCents,
    })
    .returning({ id: aiArtifacts.id });

  return row?.id ?? "";
}

/** Recent artifacts for this account — Settings shows them as the generation log. */
export async function recentArtifacts(userId: string, limit = 20) {
  return db.orm
    .select({
      id: aiArtifacts.id,
      kind: aiArtifacts.kind,
      provider: aiArtifacts.provider,
      model: aiArtifacts.model,
      promptVersion: aiArtifacts.promptVersion,
      tokensIn: aiArtifacts.tokensIn,
      tokensOut: aiArtifacts.tokensOut,
      costCents: aiArtifacts.costCents,
      createdAt: aiArtifacts.createdAt,
    })
    .from(aiArtifacts)
    .where(eq(aiArtifacts.userId, userId))
    .orderBy(desc(aiArtifacts.createdAt))
    .limit(limit);
}

/** Artifacts created since a timestamp — used by the daily cap and the monthly estimate. */
export async function countSince(userId: string, since: Date): Promise<number> {
  const rows = await db.orm
    .select({ n: sql<number>`count(*)::int` })
    .from(aiArtifacts)
    .where(and(eq(aiArtifacts.userId, userId), gte(aiArtifacts.createdAt, since)));
  return Number(rows[0]?.n ?? 0);
}

/** Token totals since a timestamp, split by provider so each can be priced correctly. */
export async function tokensSince(
  userId: string,
  since: Date,
): Promise<{
  tokensIn: number;
  tokensOut: number;
  generations: number;
  byProvider: Record<string, { tokensIn: number; tokensOut: number; generations: number }>;
}> {
  const rows = await db.orm
    .select({
      provider: aiArtifacts.provider,
      tokensIn: sql<number>`coalesce(sum(${aiArtifacts.tokensIn}), 0)::int`,
      tokensOut: sql<number>`coalesce(sum(${aiArtifacts.tokensOut}), 0)::int`,
      generations: sql<number>`count(*)::int`,
    })
    .from(aiArtifacts)
    .where(and(eq(aiArtifacts.userId, userId), gte(aiArtifacts.createdAt, since)))
    .groupBy(aiArtifacts.provider);

  const byProvider: Record<string, { tokensIn: number; tokensOut: number; generations: number }> = {};
  let tokensIn = 0;
  let tokensOut = 0;
  let generations = 0;

  for (const row of rows) {
    const entry = {
      tokensIn: Number(row.tokensIn),
      tokensOut: Number(row.tokensOut),
      generations: Number(row.generations),
    };
    byProvider[row.provider] = entry;
    tokensIn += entry.tokensIn;
    tokensOut += entry.tokensOut;
    generations += entry.generations;
  }

  return { tokensIn, tokensOut, generations, byProvider };
}

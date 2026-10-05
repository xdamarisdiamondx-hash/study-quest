/**
 * Cost guardrails (P6, ADR-025).
 *
 * Two limits and one estimate, all derived from what is already recorded in `ai_artifacts`:
 * a per-user daily cap on generations, and a monthly estimate shown in Settings. The point
 * is the one in the ADR — a runaway loop must not produce a surprise bill on either the AI
 * provider or the storage bucket.
 */
import { countSince, tokensSince } from "./cache.ts";
import type { AiProviderName } from "@sq/core/schemas/ai";

/** ADR-025 / plan section 19: 40 generations per user per day, cached results stay free. */
export const DAILY_AI_CAP = 40;

/** Local models cost electricity, not tokens — they are always 0. */
const FREE_PROVIDERS: readonly AiProviderName[] = ["ollama", "mock"];

/**
 * USD per million tokens. Public list prices for the on-demand tiers; they drift, so this
 * table is an estimate by design and Settings labels it as one.
 */
const PRICE_PER_MTOK: Partial<Record<AiProviderName, { input: number; output: number }>> = {
  groq: { input: 0.59, output: 0.79 },
  gemini: { input: 0.1, output: 0.4 },
};

export function estimateCostCents(
  provider: AiProviderName,
  tokensIn: number,
  tokensOut: number,
): number {
  if (FREE_PROVIDERS.includes(provider)) return 0;
  const price = PRICE_PER_MTOK[provider];
  if (!price) return 0;
  const usd = (tokensIn * price.input + tokensOut * price.output) / 1_000_000;
  return Math.round(usd * 100);
}

/** More precise than the per-row integer: dollars, for the monthly figure in Settings. */
export function estimateCostUsd(
  provider: AiProviderName,
  tokensIn: number,
  tokensOut: number,
): number {
  if (FREE_PROVIDERS.includes(provider)) return 0;
  const price = PRICE_PER_MTOK[provider];
  if (!price) return 0;
  return (tokensIn * price.input + tokensOut * price.output) / 1_000_000;
}

/** Midnight in the account's timezone, so "today" means the student's today. */
export function startOfDay(timezone = "UTC"): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const local = new Date(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return local;
}

export function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function usedToday(userId: string, timezone = "UTC"): Promise<number> {
  return countSince(userId, startOfDay(timezone));
}

export interface MonthlyUsage {
  monthStart: string;
  generations: number;
  tokensIn: number;
  tokensOut: number;
  /** Summed over the providers actually used, since prices differ per provider. */
  estimatedCostUsd: number;
}

export async function monthlyUsage(userId: string): Promise<MonthlyUsage> {
  const since = startOfMonth();
  const totals = await tokensSince(userId, since);
  const estimatedCostUsd = Object.entries(totals.byProvider).reduce(
    (sum, [provider, t]) => sum + estimateCostUsd(provider as AiProviderName, t.tokensIn, t.tokensOut),
    0,
  );

  return {
    monthStart: since.toISOString(),
    generations: totals.generations,
    tokensIn: totals.tokensIn,
    tokensOut: totals.tokensOut,
    estimatedCostUsd,
  };
}

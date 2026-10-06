/**
 * AI settings: what the student chose, and what the machine has (P6, ADR-007/023).
 *
 * Stored inside `users.settings.ai` — settings belong to the profile row, so there is no
 * second table to keep in step and no chance of reading another account's key.
 *
 * The key itself is write-only (ADR-023): `read` returns `hasApiKey`, never the value, and
 * the environment is reported separately so Settings can say *where* a key came from.
 */
import { eq } from "drizzle-orm";

import { aiSettingsSchema, type AiProviderName, type AiSettings } from "@sq/core/schemas/ai";
import { users } from "@sq/db/schema";

import { db } from "../db.ts";
import type { ModelTier } from "./types.ts";

/**
 * ADR-007 fallback order. The chosen provider is tried first at runtime and the rest of this
 * list follows, so a student who picks Ollama still works when Ollama is not running and a
 * key is available.
 * 
 * Groq is first since it's the default provider with a free tier and the user's API key
 * is configured in the environment.
 */
export const DEFAULT_CHAIN: readonly AiProviderName[] = ["groq", "ollama", "gemini", "openaiCompat"];

/** How long a single provider call may take before the chain moves on. */
export const PROVIDER_TIMEOUT_MS = 45_000;

/**
 * Default model per adapter per tier. Explicit in Settings always wins; otherwise a `fast`
 * prompt (summaries, explanations) uses the cheaper model and a `capable` one (quizzes,
 * flashcards) uses the larger. Free-tier availability changes often, so these are the only
 * place a model name is hard-coded — and they can be overridden without a code change by
 * setting `<PROVIDER>_<TIER>_MODEL` or `<PROVIDER>_MODEL` in `.env` (resolved in
 * `resolveProvider`, not here: ES imports are hoisted above the `dotenv` config call in
 * `index.ts`, so a module-level `process.env` read would miss the file entirely).
 *
 * Groq's catalogue rotates hard — both Llama defaults below were withdrawn while the app
 * was being built, which turned every AI call into a `provider_failed` error. These are
 * the models verified to answer on this account.
 */
export const TIER_MODEL: Record<AiProviderName, Record<ModelTier, string>> = {
  groq: { fast: "openai/gpt-oss-20b", capable: "openai/gpt-oss-120b" },
  gemini: { fast: "gemini-2.0-flash-lite", capable: "gemini-2.0-flash" },
  ollama: { fast: "qwen2.5:7b-instruct", capable: "qwen2.5:7b-instruct" },
  openaiCompat: { fast: "", capable: "" },
  mock: { fast: "mock-1", capable: "mock-1" },
};

export interface ProviderCredentials {
  apiKey: string | null;
  baseUrl: string | null;
}

/** Credentials from the environment (`.env`), the zero-configuration path. */
export function envCredentials(name: AiProviderName): ProviderCredentials {
  switch (name) {
    case "groq":
      return { apiKey: process.env.GROQ_API_KEY || null, baseUrl: null };
    case "gemini":
      return { apiKey: process.env.GEMINI_API_KEY || null, baseUrl: null };
    case "ollama":
      return { apiKey: null, baseUrl: process.env.OLLAMA_BASE_URL || null };
    case "openaiCompat":
      return {
        apiKey: process.env.OPENAI_COMPAT_API_KEY || null,
        baseUrl: process.env.OPENAI_COMPAT_BASE_URL || null,
      };
    case "mock":
      return { apiKey: "mock", baseUrl: "http://mock.local" };
  }
}

export interface ResolvedProvider {
  name: AiProviderName;
  /** Stored first, environment second: a key pasted into Settings must win. */
  apiKey: string | null;
  baseUrl: string | null;
  model: string;
}

/** Read the stored settings, falling back to schema defaults when the row is new. */
export async function readAiSettings(profileId: string): Promise<AiSettings> {
  const [row] = await db.orm
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, profileId))
    .limit(1);

  const stored = (row?.settings as { ai?: unknown } | undefined)?.ai;
  const parsed = aiSettingsSchema.safeParse(stored ?? {});
  return parsed.success ? parsed.data : aiSettingsSchema.parse({});
}

/** Shallow merge of one patch into the stored AI settings. */
export async function writeAiSettings(profileId: string, patch: Partial<AiSettings>): Promise<AiSettings> {
  const current = await readAiSettings(profileId);
  const next: AiSettings = { ...current, ...patch };

  const [row] = await db.orm.select({ settings: users.settings }).from(users).where(eq(users.id, profileId)).limit(1);
  const settings = (row?.settings as Record<string, unknown> | undefined) ?? {};

  await db.orm
    .update(users)
    .set({ settings: { ...settings, ai: next } })
    .where(eq(users.id, profileId));

  return next;
}

/** Does this provider have what it needs to be called at all? */
export function isConfigured(name: AiProviderName, settings: AiSettings): boolean {
  if (name === "mock") return true;
  const storedFirst = name === settings.provider ? settings.apiKey : undefined;
  const env = envCredentials(name);
  if (name === "ollama") return Boolean(env.baseUrl);
  if (name === "openaiCompat") return Boolean(env.baseUrl && (storedFirst || env.apiKey));
  return Boolean(storedFirst || env.apiKey);
}

/** Resolve credentials and model for one adapter, stored values winning over the environment. */
export function resolveProvider(
  name: AiProviderName,
  settings: AiSettings,
  tier: ModelTier = "capable",
): ResolvedProvider {
  const env = envCredentials(name);
  const storedKey = name === settings.provider ? (settings.apiKey ?? null) : null;
  // An explicit model in Settings is a deliberate choice and applies to the chosen provider;
  // every other provider (and any prompt of a lower tier) falls back to the tier default.
  const explicit = name === settings.provider ? settings.model.trim() : "";
  // `.env` can rotate a withdrawn model without touching this file. Read at call time —
  // module scope runs before dotenv has loaded.
  const fromEnv =
    process.env[`${name.toUpperCase()}_${tier.toUpperCase()}_MODEL`] ||
    process.env[`${name.toUpperCase()}_MODEL`] ||
    "";

  return {
    name,
    apiKey: storedKey ?? env.apiKey,
    baseUrl: env.baseUrl,
    model: explicit || fromEnv || TIER_MODEL[name][tier] || "",
  };
}

/**
 * The chain for this request: the student's choice first, then the ADR-007 order.
 * `mock` is never an automatic fallback — silently returning a canned answer would look
 * like the model worked.
 */
export function chainFor(settings: AiSettings): AiProviderName[] {
  const rest = DEFAULT_CHAIN.filter((name) => name !== settings.provider);
  return settings.enabled ? [settings.provider, ...rest] : [];
}

/**
 * The orchestrator (P6): cache → cap → chain → validate → repair → record.
 *
 * This is the only file that knows the whole pipeline, which is what lets every feature
 * (summaries, explain, quizzes, flashcards) be one call that returns a validated value.
 * Order matters: the cache is consulted *before* the daily cap, so an over-cap account still
 * gets its previously generated results — exactly the behaviour ADR-025 specifies.
 */
import type { AiProviderName } from "@sq/core/schemas/ai";

import { z } from "zod";
import { findCached, inputHash, storeArtifact, type CachedRow } from "./cache.ts";
import { getPrompt, type PromptEntry, type PromptInput, type PromptKey } from "./prompts.ts";
import { chain } from "./registry.ts";
import { readAiSettings } from "./settings.ts";
import { AiError, type AiProvider, type AiRequest, type AiResult, type ChatMessage } from "./types.ts";
import { DAILY_AI_CAP, estimateCostCents, usedToday } from "./usage.ts";

export interface RunOptions<K extends PromptKey> {
  profileId: string;
  key: K;
  input: PromptInput[K];
  /** What the result is *about* — a note id, a topic id, or the literal text's hash target. */
  sourceId: string;
  sourceType: "note" | "topic" | "text";
  /** Extra cache discriminators beyond the prompt input. */
  options?: Record<string, unknown>;
  /** Ignore a cached result and generate again (the "Regenerate" button). */
  fresh?: boolean;
  signal?: AbortSignal;
}

export interface RunOutcome {
  /** Parsed and validated for structured prompts; the raw text otherwise. */
  value: unknown;
  text: string;
  cached: boolean;
  provider: AiProviderName;
  model: string;
  promptVersion: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  latencyMs: number;
  artifactId: string;
  /** Set when the answer came from a fallback rather than the chosen provider. */
  degradedFrom?: AiProviderName;
}

function providerName(value: string): AiProviderName {
  return value === "groq" || value === "gemini" || value === "ollama" || value === "mock"
    ? value
    : "openaiCompat";
}

function outcomeFromCache(row: CachedRow, entry: PromptEntry): RunOutcome {
  const structured = entry.schema !== undefined;
  return {
    value: structured ? (row.outputJson ?? null) : (row.outputText ?? ""),
    text: row.outputText ?? (row.outputJson ? JSON.stringify(row.outputJson, null, 2) : ""),
    cached: true,
    provider: providerName(row.provider),
    model: row.model,
    promptVersion: entry.key,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    costCents: row.costCents,
    latencyMs: 0,
    artifactId: row.id,
  };
}

/**
 * Pull a JSON object out of whatever the model produced.
 *
 * Models fence their JSON, preface it with a sentence, or both. The schema is the contract;
 * this only gets the payload to the point where the contract can be checked (ADR-009).
 */
export function extractJson(raw: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const candidate = fenced?.[1] ?? raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

interface ParseAttempt {
  ok: boolean;
  value?: unknown;
  errors?: string;
}

function parseStructured(entry: PromptEntry, raw: string): ParseAttempt {
  const schema = entry.schema;
  if (!schema) return { ok: true, value: raw };

  const json = extractJson(raw);
  if (json === null) return { ok: false, errors: "The reply contained no JSON object." };

  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch (err) {
    return { ok: false, errors: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    const errors = result.error.issues
      .slice(0, 6)
      .map((i: z.ZodIssue) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    return { ok: false, errors };
  }
  return { ok: true, value: result.data };
}

/** The deterministic answer the mock adapter will give, for golden-file tests. */
function mockAnswer(entry: PromptEntry, input: PromptInput[PromptKey]): unknown {
  return entry.mock(input);
}

async function callChain(
  providers: AiProvider[],
  request: AiRequest,
): Promise<{ result: AiResult; provider: AiProvider; attempts: string[] }> {
  const attempts: string[] = [];
  const usable = providers.filter((p) => p.configured);

  for (const provider of usable) {
    try {
      const result = await provider.complete(request);
      return { result, provider, attempts };
    } catch (err) {
      if (err instanceof AiError && err.code === "aborted") throw err;
      const detail = err instanceof AiError ? (err.detail ?? err.message) : String(err);
      attempts.push(`${provider.name}: ${detail}`);
      console.warn(`[ai] ${provider.name} failed, trying next — ${detail}`);
    }
  }

  if (usable.length === 0) {
    throw new AiError(
      "not_configured",
      "No AI provider is configured yet. Add one in Settings to turn AI features on.",
      attempts.join("; ") || undefined,
    );
  }

  throw new AiError(
    "provider_failed",
    "Every configured model failed to answer. Check the connection in Settings.",
    attempts.join("; "),
  );
}

/**
 * Generate (or fetch from cache) one prompt's result.
 *
 * Structured prompts get Zod validation with exactly one repair retry, then a hard failure —
 * a quiz the model half-got-right is worse than no quiz (ADR-009).
 */
export async function runPrompt<K extends PromptKey>(opts: RunOptions<K>): Promise<RunOutcome> {
  const entry = getPrompt(opts.key) as PromptEntry;
  const hash = inputHash({ key: opts.key, input: opts.input, options: opts.options ?? {} });

  if (!opts.fresh) {
    const hit = await findCached({
      userId: opts.profileId,
      kind: entry.kind,
      sourceId: opts.sourceId,
      hash,
      promptVersion: entry.key,
    });
    if (hit) return outcomeFromCache(hit, entry);
  }

  const settings = await readAiSettings(opts.profileId);
  const used = await usedToday(opts.profileId);
  if (used >= DAILY_AI_CAP) {
    throw new AiError(
      "cap_reached",
      `You have used all ${DAILY_AI_CAP} AI generations for today. Cached results are still available; more come back tomorrow.`,
    );
  }

  const messages = entry.build(opts.input);
  const request: AiRequest = {
    messages,
    json: entry.schema !== undefined,
    temperature: entry.schema ? 0.2 : 0.5,
    maxTokens: entry.kind === "summary" || entry.kind === "explain" ? 1200 : 4096,
    mock: () => mockAnswer(entry, opts.input),
    ...(opts.signal ? { signal: opts.signal } : {}),
  };

  const providers = chain(settings, entry.tier);
  const { result, provider, attempts } = await callChain(providers, request);

  let value: unknown = result.text;
  let text = result.text;
  let finalResult = result;
  const finalProvider = provider;

  if (entry.schema) {
    let attempt = parseStructured(entry, result.text);

    if (!attempt.ok) {
      // One repair retry (ADR-009): show the model its own mistake and the exact mismatch.
      const repairMessages: ChatMessage[] = [
        ...messages,
        { role: "assistant", content: result.text.slice(0, 8000) },
        {
          role: "user",
          content: `That did not match the required schema:\n${attempt.errors}\n\nReply again with only the corrected JSON object.`,
        },
      ];

      try {
        const repaired = await finalProvider.complete({ ...request, messages: repairMessages, temperature: 0 });
        attempt = parseStructured(entry, repaired.text);
        finalResult = { ...repaired, tokensIn: result.tokensIn + repaired.tokensIn, tokensOut: result.tokensOut + repaired.tokensOut };
      } catch (err) {
        if (err instanceof AiError && err.code === "aborted") throw err;
        console.warn(`[ai] repair attempt failed: ${String(err)}`);
      }
    }

    if (!attempt.ok) {
      throw new AiError(
        "invalid_output",
        "The model's answer did not match the required structure, even after one correction. Try regenerating.",
        attempt.errors,
      );
    }

    value = attempt.value;
    text = JSON.stringify(value, null, 2);
  }

  const costCents = estimateCostCents(finalProvider.name, finalResult.tokensIn, finalResult.tokensOut);
  const artifactId = await storeArtifact({
    userId: opts.profileId,
    kind: entry.kind,
    sourceId: opts.sourceId,
    sourceType: opts.sourceType,
    hash,
    promptVersion: entry.key,
    provider: finalProvider.name,
    model: finalResult.model,
    outputJson: entry.schema ? (value as Record<string, unknown>) : null,
    outputText: entry.schema ? null : text,
    tokensIn: finalResult.tokensIn,
    tokensOut: finalResult.tokensOut,
    costCents,
    options: opts.options ?? {},
  });

  console.log(
    `[ai] generated ${entry.key} via ${finalProvider.name}/${finalResult.model} ` +
      `(${finalResult.tokensIn}in ${finalResult.tokensOut}out, ${finalResult.latencyMs}ms${attempts.length ? `, after ${attempts.join(" | ")}` : ""})`,
  );

  const chosen = providers[0];
  return {
    value,
    text,
    cached: false,
    provider: finalProvider.name,
    model: finalResult.model,
    promptVersion: entry.key,
    tokensIn: finalResult.tokensIn,
    tokensOut: finalResult.tokensOut,
    costCents,
    latencyMs: finalResult.latencyMs,
    artifactId,
    ...(chosen && chosen.name !== finalProvider.name ? { degradedFrom: chosen.name } : {}),
  };
}

export interface StreamOutcome {
  text: string;
  cached: boolean;
  provider: AiProviderName;
  model: string;
  artifactId: string;
}

/**
 * Stream a text prompt, assembling and recording the artifact when the stream ends.
 *
 * A cached result is replayed as a single chunk rather than faked token by token — the UI
 * cares that the text arrives, and pretending to be slow would be dishonest.
 */
export async function* streamPrompt<K extends PromptKey>(
  opts: RunOptions<K>,
): AsyncGenerator<string, StreamOutcome> {
  const entry = getPrompt(opts.key) as PromptEntry;
  const hash = inputHash({ key: opts.key, input: opts.input, options: opts.options ?? {} });

  const hit = await findCached({
    userId: opts.profileId,
    kind: entry.kind,
    sourceId: opts.sourceId,
    hash,
    promptVersion: entry.key,
  });

  if (hit) {
    const text = hit.outputText ?? "";
    yield text;
    return {
      text,
      cached: true,
      provider: providerName(hit.provider),
      model: hit.model,
      artifactId: hit.id,
    };
  }

  const settings = await readAiSettings(opts.profileId);
  const used = await usedToday(opts.profileId);
  if (used >= DAILY_AI_CAP) {
    throw new AiError("cap_reached", `You have used all ${DAILY_AI_CAP} AI generations for today.`);
  }

  const messages = entry.build(opts.input);
  const request: AiRequest = {
    messages,
    temperature: 0.5,
    maxTokens: 1200,
    mock: () => mockAnswer(entry, opts.input),
    ...(opts.signal ? { signal: opts.signal } : {}),
  };

  const providers = chain(settings, entry.tier).filter((p) => p.configured);
  if (providers.length === 0) {
    throw new AiError("not_configured", "No AI provider is configured yet. Add one in Settings.");
  }

  let assembled = "";
  let usedProvider: AiProvider | null = null;
  let model = "";
  const attempts: string[] = [];

  for (const provider of providers) {
    if (!provider.stream) {
      attempts.push(`${provider.name}: cannot stream`);
      continue;
    }
    try {
      for await (const delta of provider.stream(request)) {
        assembled += delta;
        yield delta;
      }
      usedProvider = provider;
      model = provider.model;
      break;
    } catch (err) {
      if (err instanceof AiError && err.code === "aborted") break;
      attempts.push(`${provider.name}: ${err instanceof Error ? err.message : String(err)}`);
      // Anything streamed so far is discarded: a half-answer must not be cached.
      assembled = "";
      console.warn(`[ai] stream failed over: ${attempts[attempts.length - 1]}`);
    }
  }

  if (!usedProvider) {
    throw new AiError(
      "provider_failed",
      "The model could not be reached. Check the connection in Settings.",
      attempts.join("; "),
    );
  }

  const tokensIn = Math.ceil(
    messages.reduce((n: number, m: ChatMessage) => n + m.content.length, 0) / 4,
  );
  const tokensOut = Math.ceil(assembled.length / 4);
  const artifactId = await storeArtifact({
    userId: opts.profileId,
    kind: entry.kind,
    sourceId: opts.sourceId,
    sourceType: opts.sourceType,
    hash,
    promptVersion: entry.key,
    provider: usedProvider.name,
    model,
    outputJson: null,
    outputText: assembled,
    tokensIn,
    tokensOut,
    costCents: estimateCostCents(usedProvider.name, tokensIn, tokensOut),
    options: opts.options ?? {},
  });

  return {
    text: assembled,
    cached: false,
    provider: usedProvider.name,
    model,
    artifactId,
  };
}

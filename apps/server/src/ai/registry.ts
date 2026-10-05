/**
 * Provider registry (P6, ADR-006/007).
 *
 * One place turns settings into an adapter, and one place reports health. Feature code never
 * comes here directly — it goes through `runPrompt`, which walks the chain this file builds.
 *
 * Note on probing: the generation path does *not* call `health()` before every request. A
 * probe is a second round trip that would double latency on the common path; the chain
 * instead discovers failure by failing over. `health()` is what Settings' "Test connection"
 * button and the status endpoint call, where a clear answer matters more than a fast one.
 */
import type { AiHealth, AiProviderName, AiSettings } from "@sq/core/schemas/ai";

import { groqProvider, openAiCompatProvider } from "./providers/groq.ts";
import { geminiProvider } from "./providers/gemini.ts";
import { mockProvider } from "./providers/mock.ts";
import { ollamaProvider } from "./providers/ollama.ts";
import { chainFor, resolveProvider } from "./settings.ts";
import type { AiProvider, ModelTier } from "./types.ts";

/** Build the adapter for one provider, configured or not. */
export function buildProvider(
  name: AiProviderName,
  settings: AiSettings,
  tier: ModelTier = "capable",
): AiProvider {
  const resolved = resolveProvider(name, settings, tier);

  switch (name) {
    case "groq":
      return groqProvider({ apiKey: resolved.apiKey, model: resolved.model });
    case "ollama":
      return ollamaProvider({ baseUrl: resolved.baseUrl ?? "", model: resolved.model });
    case "gemini":
      return geminiProvider({ apiKey: resolved.apiKey, model: resolved.model });
    case "openaiCompat":
      return openAiCompatProvider({
        name: "openaiCompat",
        baseUrl: resolved.baseUrl ?? "",
        model: resolved.model,
        apiKey: resolved.apiKey,
      });
    case "mock":
      return mockProvider();
  }
}

/**
 * The ordered adapters for this account: the chosen provider first, then ADR-007's order.
 * Unconfigured adapters are kept in the list — `complete()` reports `not_configured` and the
 * chain skips them without spending a round trip.
 */
export function chain(settings: AiSettings, tier: ModelTier = "capable"): AiProvider[] {
  return chainFor(settings).map((name) => buildProvider(name, settings, tier));
}

/** Probe every adapter in the chain in parallel (Settings "Test connection" and status). */
export async function probeAll(settings: AiSettings): Promise<AiHealth[]> {
  const providers = chain(settings);
  if (providers.length === 0) {
    return [{ ok: false, provider: "ollama", detail: "AI is switched off in Settings." }];
  }
  return Promise.all(providers.map((p) => p.health()));
}

/** Is anything at all configured? Drives the offline "connect a model" prompt (ADR-007). */
export function anyConfigured(settings: AiSettings): boolean {
  return chain(settings).some((p) => p.configured);
}

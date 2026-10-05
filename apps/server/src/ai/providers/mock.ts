/**
 * Mock adapter (P6) — the deterministic provider every prompt's golden test runs against.
 *
 * It answers from `AiRequest.mock`, which the orchestrator fills in from the prompt
 * registry. That keeps prompt knowledge in one place (the registry) while `mock` remains a
 * genuine `AiProvider`, so the contract tests cover it exactly like Groq or Ollama.
 */
import type { AiHealth } from "@sq/core/schemas/ai";

import type { AiProvider, AiRequest, AiResult } from "../types.ts";
import { AiError } from "../types.ts";

/** Rough tokens-per-character ratio, good enough for a ledger that is an estimate anyway. */
const CHARS_PER_TOKEN = 4;

export function mockProvider(): AiProvider {
  return {
    name: "mock",
    model: "mock-1",
    configured: true,

    async complete(request: AiRequest): Promise<AiResult> {
      const started = Date.now();
      if (!request.mock) {
        throw new AiError("not_configured", "This prompt has no golden output for the mock provider.");
      }

      const value = request.mock();
      const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
      const promptChars = request.messages.reduce((sum, m) => sum + m.content.length, 0);

      return {
        text,
        model: "mock-1",
        tokensIn: Math.ceil(promptChars / CHARS_PER_TOKEN),
        tokensOut: Math.ceil(text.length / CHARS_PER_TOKEN),
        latencyMs: Date.now() - started + 5,
      };
    },

    async health(): Promise<AiHealth> {
      return { ok: true, provider: "mock", model: "mock-1", detail: "Deterministic test provider." };
    },
  };
}

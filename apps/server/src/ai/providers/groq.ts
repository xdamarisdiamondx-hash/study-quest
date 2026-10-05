/**
 * Groq adapter (P6). OpenAI-compatible endpoints, bearer auth, no API version in the path.
 *
 * Groq is the provider the app is actually configured for on this machine (see `.env`), but
 * nothing above this file knows that — which is the requirement ADR-006 exists to enforce.
 */
import type { AiHealth, AiProviderName } from "@sq/core/schemas/ai";

import type { AiProvider, AiRequest, AiResult } from "../types.ts";
import { AiError } from "../types.ts";
import { chatComplete, chatStream, isAbort } from "./chat.ts";

export const GROQ_BASE = "https://api.groq.com/openai/v1";

export interface OpenAiCompatOptions {
  name: AiProviderName;
  baseUrl: string;
  model: string;
  apiKey: string | null;
  fetchImpl?: typeof fetch;
}

/** Groq and any other OpenAI-compatible endpoint, differing only in these options. */
export function openAiCompatProvider(opts: OpenAiCompatOptions): AiProvider {
  const url = `${opts.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const usable = opts.name === "ollama" ? true : Boolean(opts.apiKey) && Boolean(opts.model);

  const call = (request: AiRequest) => ({
    url,
    apiKey: opts.apiKey,
    model: opts.model,
    request,
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });

  return {
    name: opts.name,
    model: opts.model,
    configured: usable,

    async complete(request: AiRequest): Promise<AiResult> {
      if (!opts.model) {
        throw new AiError("not_configured", `No model is set for ${opts.name}.`);
      }
      if (opts.name !== "ollama" && !opts.apiKey) {
        throw new AiError("not_configured", `No API key is set for ${opts.name}.`);
      }
      return chatComplete(call(request));
    },

    stream(request: AiRequest) {
      return chatStream(call(request));
    },

    async health(): Promise<AiHealth> {
      if (!opts.apiKey && opts.name !== "ollama") {
        return { ok: false, provider: opts.name, detail: "No API key configured." };
      }
      const started = Date.now();
      try {
        const res = await (opts.fetchImpl ?? fetch)(`${opts.baseUrl.replace(/\/$/, "")}/models`, {
          headers: opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {},
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) {
          return {
            ok: false,
            provider: opts.name,
            detail: `Listed models: HTTP ${res.status}`,
            latencyMs: Date.now() - started,
          };
        }
        const payload = (await res.json().catch(() => null)) as { data?: { id?: string }[] } | null;
        const ids = (payload?.data ?? []).map((m) => m.id ?? "");
        const ok = ids.length > 0;
        return {
          ok,
          provider: opts.name,
          model: opts.model,
          detail: ok ? `${ids.length} models available` : "Endpoint reachable but listed no models.",
          latencyMs: Date.now() - started,
        };
      } catch (err) {
        if (isAbort(err)) {
          return { ok: false, provider: opts.name, detail: "Timed out.", latencyMs: Date.now() - started };
        }
        return {
          ok: false,
          provider: opts.name,
          detail: err instanceof Error ? err.message : "Unreachable.",
          latencyMs: Date.now() - started,
        };
      }
    },
  };
}

/** The Groq adapter proper: OpenAI-compatible, with Groq's base URL and default model. */
export function groqProvider(opts: {
  apiKey: string | null;
  model: string;
  fetchImpl?: typeof fetch;
}): AiProvider {
  return openAiCompatProvider({
    name: "groq",
    baseUrl: GROQ_BASE,
    model: opts.model,
    apiKey: opts.apiKey,
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });
}

/**
 * Gemini adapter (P6), via the generativelanguage REST API.
 *
 * Written to the same `AiProvider` contract as the rest so the provider can be swapped in
 * Settings without a code change (ADR-006).
 */
import type { AiHealth } from "@sq/core/schemas/ai";

import type { AiProvider, AiRequest, AiResult, ChatMessage } from "../types.ts";
import { AiError } from "../types.ts";
import { isAbort } from "./chat.ts";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiOptions {
  apiKey: string | null;
  model: string;
  fetchImpl?: typeof fetch;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

/** Gemini alternates user/model roles rather than using a system token. */
function toGemini(messages: ChatMessage[]) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  return { system, contents: rest };
}

export function geminiProvider(opts: GeminiOptions): AiProvider {
  const fetchImpl = opts.fetchImpl ?? fetch;

  return {
    name: "gemini",
    model: opts.model,
    configured: Boolean(opts.apiKey),

    async complete(request: AiRequest): Promise<AiResult> {
      if (!opts.apiKey) throw new AiError("not_configured", "No Gemini API key configured.");
      if (!opts.model) throw new AiError("not_configured", "No Gemini model is set.");

      const { system, contents } = toGemini(
        request.json
          ? [
              {
                role: "system",
                content:
                  "Respond with a single valid JSON object and nothing else — no prose, no markdown fences.",
              },
              ...request.messages,
            ]
          : request.messages,
      );

      const started = Date.now();
      let res: Response;
      try {
        res = await fetchImpl(
          `${ENDPOINT}/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
              contents,
              generationConfig: {
                temperature: request.temperature ?? 0.4,
                ...(request.maxTokens ? { maxOutputTokens: request.maxTokens } : {}),
                ...(request.json ? { responseMimeType: "application/json" } : {}),
              },
            }),
            signal: request.signal ?? AbortSignal.timeout(45_000),
          },
        );
      } catch (err) {
        if (isAbort(err)) throw new AiError("aborted", "The request was stopped.");
        throw new AiError("provider_failed", "Gemini could not be reached.", String(err));
      }

      const payload = (await res.json().catch(() => null)) as GeminiResponse | null;
      if (!res.ok || !payload || payload.error) {
        throw new AiError(
          "provider_failed",
          "Gemini rejected the request.",
          payload?.error?.message ?? `HTTP ${res.status}`,
        );
      }

      const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) throw new AiError("provider_failed", "Gemini returned no content.");

      return {
        text,
        model: opts.model,
        tokensIn: payload.usageMetadata?.promptTokenCount ?? 0,
        tokensOut: payload.usageMetadata?.candidatesTokenCount ?? 0,
        latencyMs: Date.now() - started,
      };
    },

    async health(): Promise<AiHealth> {
      if (!opts.apiKey) return { ok: false, provider: "gemini", detail: "No API key configured." };
      const started = Date.now();
      try {
        const res = await fetchImpl(`${ENDPOINT}/models?key=${encodeURIComponent(opts.apiKey)}`, {
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) {
          return { ok: false, provider: "gemini", detail: `HTTP ${res.status}`, latencyMs: Date.now() - started };
        }
        const payload = (await res.json().catch(() => null)) as { models?: { name?: string }[] } | null;
        const count = payload?.models?.length ?? 0;
        return {
          ok: count > 0,
          provider: "gemini",
          model: opts.model,
          detail: `${count} models available`,
          latencyMs: Date.now() - started,
        };
      } catch (err) {
        return {
          ok: false,
          provider: "gemini",
          detail: isAbort(err) ? "Timed out." : "Unreachable.",
          latencyMs: Date.now() - started,
        };
      }
    },
  };
}

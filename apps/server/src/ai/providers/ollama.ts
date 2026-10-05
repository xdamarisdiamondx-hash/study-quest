/**
 * Ollama adapter (P6) — the local, free, offline-first provider in ADR-007.
 *
 * Uses Ollama's own `/api/chat` rather than its OpenAI shim: the native API reports token
 * counts (`prompt_eval_count` / `eval_count`), which the cost ledger in ADR-025 needs.
 */
import type { AiHealth } from "@sq/core/schemas/ai";

import type { AiProvider, AiRequest, AiResult, ChatMessage } from "../types.ts";
import { AiError } from "../types.ts";
import { isAbort } from "./chat.ts";

interface OllamaOptions {
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
}

interface OllamaChat {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

export function ollamaProvider(opts: OllamaOptions): AiProvider {
  const base = opts.baseUrl.replace(/\/$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;

  return {
    name: "ollama",
    model: opts.model,
    configured: Boolean(opts.baseUrl),

    async complete(request: AiRequest): Promise<AiResult> {
      if (!opts.model) throw new AiError("not_configured", "No Ollama model is set.");

      const messages: ChatMessage[] = request.json
        ? [
            {
              role: "system",
              content:
                "Respond with a single valid JSON object and nothing else — no prose, no markdown fences.",
            },
            ...request.messages,
          ]
        : request.messages;

      const started = Date.now();
      let res: Response;
      try {
        res = await fetchImpl(`${base}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: opts.model,
            messages,
            stream: false,
            ...(request.json ? { format: "json" } : {}),
            options: {
              temperature: request.temperature ?? 0.4,
              ...(request.maxTokens ? { num_predict: request.maxTokens } : {}),
            },
          }),
          signal: request.signal ?? AbortSignal.timeout(45_000),
        });
      } catch (err) {
        if (isAbort(err)) throw new AiError("aborted", "The request was stopped.");
        throw new AiError(
          "provider_failed",
          "Ollama is not responding. Is it running?",
          err instanceof Error ? err.message : String(err),
        );
      }

      const payload = (await res.json().catch(() => null)) as OllamaChat | null;
      if (!res.ok || !payload || payload.error) {
        throw new AiError("provider_failed", "Ollama rejected the request.", payload?.error ?? `HTTP ${res.status}`);
      }

      const text = payload.message?.content;
      if (typeof text !== "string") {
        throw new AiError("provider_failed", "Ollama returned no content.");
      }

      return {
        text,
        model: opts.model,
        tokensIn: payload.prompt_eval_count ?? 0,
        tokensOut: payload.eval_count ?? 0,
        latencyMs: Date.now() - started,
      };
    },

    async *stream(request: AiRequest) {
      let res: Response;
      try {
        res = await fetchImpl(`${base}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: opts.model,
            messages: request.messages,
            stream: true,
            options: { temperature: request.temperature ?? 0.4 },
          }),
          signal: request.signal ?? AbortSignal.timeout(120_000),
        });
      } catch (err) {
        if (isAbort(err)) return;
        throw new AiError("provider_failed", "Ollama is not responding.");
      }

      if (!res.ok || !res.body) {
        throw new AiError("provider_failed", "Ollama rejected the stream request.", `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line) as OllamaChat;
              if (parsed.message?.content) yield parsed.message.content;
            } catch {
              // Incomplete line; the next read completes it.
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },

    async health(): Promise<AiHealth> {
      const started = Date.now();
      try {
        const res = await fetchImpl(`${base}/api/tags`, { signal: AbortSignal.timeout(4_000) });
        if (!res.ok) {
          return { ok: false, provider: "ollama", detail: `HTTP ${res.status}`, latencyMs: Date.now() - started };
        }
        const payload = (await res.json().catch(() => null)) as { models?: { name?: string }[] } | null;
        const models = payload?.models ?? [];
        const installed = models.some((m) => m.name === opts.model || m.name?.startsWith(`${opts.model}:`));
        return {
          ok: true,
          provider: "ollama",
          model: opts.model,
          detail: installed
            ? `${models.length} models installed`
            : `"${opts.model}" is not installed — try: ollama pull ${opts.model}`,
          latencyMs: Date.now() - started,
        };
      } catch (err) {
        return {
          ok: false,
          provider: "ollama",
          detail: isAbort(err)
            ? "Timed out."
            : "Not running. Start Ollama, or pick a cloud provider in Settings.",
          latencyMs: Date.now() - started,
        };
      }
    },
  };
}

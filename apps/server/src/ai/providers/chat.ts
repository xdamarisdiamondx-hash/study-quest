/**
 * Shared plumbing for OpenAI-compatible chat endpoints (Groq, OpenRouter, vLLM, …).
 *
 * Groq's API *is* OpenAI-compatible, so the difference between `groq` and `openaiCompat` is
 * a base URL, a default model and a price table — not code. Keeping that in one place is what
 * makes "add a provider" a twenty-line change.
 */
import { AiError, type AiRequest, type AiResult, type ChatMessage } from "../types.ts";

/** Base timeout for a non-streaming call; streams get their own budget. */
const TIMEOUT_MS = 45_000;

export interface ChatCall {
  url: string;
  apiKey: string | null;
  model: string;
  request: AiRequest;
  fetchImpl?: typeof fetch;
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function buildBody(model: string, request: AiRequest): Record<string, unknown> {
  const messages: ChatMessage[] = [...request.messages];
  if (request.json) {
    // Provider-agnostic JSON mode (ADR-006): an instruction, not a vendor feature flag,
    // so the same prompt works against Ollama, Groq and anything else unchanged.
    messages.unshift({
      role: "system",
      content:
        "Respond with a single valid JSON object and nothing else — no prose, no markdown fences.",
    });
  }

  return {
    model,
    messages,
    temperature: request.temperature ?? 0.4,
    max_tokens: request.maxTokens ?? 2048,
    stream: false,
  };
}

interface ChatCompletion {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
  error?: { message?: string };
}

/** One non-streaming round trip against an OpenAI-compatible `/chat/completions`. */
export async function chatComplete(call: ChatCall): Promise<AiResult> {
  const fetchImpl = call.fetchImpl ?? fetch;
  const started = Date.now();

  let res: Response;
  try {
    res = await fetchImpl(call.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(call.apiKey ? { Authorization: `Bearer ${call.apiKey}` } : {}),
      },
      body: JSON.stringify(buildBody(call.model, call.request)),
      signal: withTimeout(call.request.signal, TIMEOUT_MS),
    });
  } catch (err) {
    if (isAbort(err)) throw new AiError("aborted", "The request was stopped.");
    throw new AiError("provider_failed", "The model could not be reached.", describe(err));
  }

  const payload = (await res.json().catch(() => null)) as ChatCompletion | null;

  if (!res.ok) {
    const detail = payload?.error?.message ?? `${res.status} ${res.statusText}`;
    throw new AiError("provider_failed", "The model rejected the request.", detail);
  }

  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new AiError("provider_failed", "The model returned no content.", JSON.stringify(payload).slice(0, 400));
  }

  return {
    text,
    model: payload?.model ?? call.model,
    tokensIn: payload?.usage?.prompt_tokens ?? 0,
    tokensOut: payload?.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - started,
  };
}

/**
 * Token-by-token streaming over SSE.
 *
 * Yields decoded deltas only; usage numbers are unavailable on most SSE streams, so the
 * caller estimates them from the characters it received.
 */
export async function* chatStream(call: ChatCall): AsyncGenerator<string> {
  const fetchImpl = call.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await fetchImpl(call.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(call.apiKey ? { Authorization: `Bearer ${call.apiKey}` } : {}),
      },
      body: JSON.stringify({ ...buildBody(call.model, call.request), stream: true }),
      signal: call.request.signal ?? AbortSignal.timeout(120_000),
    });
  } catch (err) {
    if (isAbort(err)) return;
    throw new AiError("provider_failed", "The model could not be reached.", describe(err));
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new AiError("provider_failed", "The model rejected the request.", `${res.status} ${detail.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as {
              choices?: { delta?: { content?: string | null } }[];
            };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch {
            // A partial frame we cannot parse yet: the next read will complete it.
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}

function describe(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

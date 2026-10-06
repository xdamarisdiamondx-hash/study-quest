/**
 * Provider contract suite (P6, ADR-006).
 *
 * Every adapter answers to the same `AiProvider`, which is what makes "switch the provider
 * in Settings and nothing above this layer changes" a tested claim rather than a comment.
 * The same checks run against all five — Groq, the generic OpenAI-compatible adapter,
 * Gemini, Ollama and the mock — with `fetch` stubbed throughout, so the suite needs no
 * network, no API key and no running Ollama to prove it.
 *
 * The contract, as `types.ts` states it:
 *   - `complete` resolves to an `AiResult` naming the model that produced it
 *   - missing credentials fail as `not_configured` before any round trip (ADR-007)
 *   - a rejecting or unreachable endpoint fails as `provider_failed`, never as a raw Error
 *   - an aborted call reports `aborted`, so "stopped" stays distinguishable from "failed"
 *   - `health` answers without throwing, configured or not
 *   - `stream` exists only where the provider really streams; its absence is part of the
 *     contract, and callers fall back to whole-text because of it
 */
import { describe, expect, it } from "vitest";

import {
  AiError,
  aiErrorStatus,
  type AiProvider,
  type AiRequest,
  type ChatMessage,
} from "../types.ts";
import { geminiProvider } from "./gemini.ts";
import { groqProvider, openAiCompatProvider } from "./groq.ts";
import { mockProvider } from "./mock.ts";
import { ollamaProvider } from "./ollama.ts";

const TEXT = "Force equals mass times acceleration.";
const STREAM_PARTS = ["Force equals ", "mass times ", "acceleration."];
const MODEL = "test-model";
const PROMPT: ChatMessage[] = [
  { role: "user", content: "Explain why a book on a table stays put." },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const sse = (...deltas: string[]) =>
  new Response(
    deltas
      .map((d) => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`)
      .join("") + "data: [DONE]\n\n",
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );

const ndjson = (...chunks: string[]) =>
  new Response(chunks.map((c) => `${JSON.stringify({ message: { content: c } })}\n`).join(""), {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  });

const baseRequest = (over: Partial<AiRequest> = {}): AiRequest => ({ messages: PROMPT, ...over });

/** A fetch that has failed the way an offline machine's does. */
const unreachable: typeof fetch = async () => {
  throw new Error("ECONNREFUSED 127.0.0.1:1");
};

/** A fetch that fails the way a bad credential does: HTTP, with the endpoint's own words. */
const rejecting: typeof fetch = async () => json({ error: { message: "Invalid API key" } }, 401);

interface Subject {
  label: string;
  /** Reaches out over HTTP — everything but the mock. */
  network: boolean;
  /** Built with credentials, a model and an endpoint. */
  ready(fetchImpl?: typeof fetch): AiProvider;
  /** Built with nothing: must refuse, and say why, before any round trip. */
  bare(fetchImpl?: typeof fetch): AiProvider;
  /** The request `ready()` answers; `bareRequest()` is one it must refuse. */
  request(over?: Partial<AiRequest>): AiRequest;
  bareRequest(over?: Partial<AiRequest>): AiRequest;
  /** What each of this adapter's endpoints returns when all is well. */
  ok: { complete: () => Response; stream?: () => Response; health: () => Response };
  /** Whether `complete` honours `request.signal`. The mock answers instantly and does not. */
  abortable: boolean;
  /** Whether `health()` reports healthy with nothing configured — true only for the mock. */
  bareHealthOk: boolean;
}

const OLLAMA_URL = "http://127.0.0.1:11434";
const COMPAT_URL = "http://llm.test/v1";

const subjects: Subject[] = [
  {
    label: "groq",
    network: true,
    ready: (fetchImpl) => groqProvider({ apiKey: "key", model: MODEL, fetchImpl }),
    bare: (fetchImpl) => groqProvider({ apiKey: null, model: "", fetchImpl }),
    request: baseRequest,
    bareRequest: baseRequest,
    ok: {
      complete: () =>
        json({
          choices: [{ message: { content: TEXT } }],
          usage: { prompt_tokens: 11, completion_tokens: 7 },
        }),
      stream: () => sse(...STREAM_PARTS),
      health: () => json({ data: [{ id: "m1" }, { id: "m2" }] }),
    },
    abortable: true,
    bareHealthOk: false,
  },
  {
    label: "openaiCompat",
    network: true,
    ready: (fetchImpl) =>
      openAiCompatProvider({
        name: "openaiCompat",
        baseUrl: COMPAT_URL,
        model: MODEL,
        apiKey: "key",
        fetchImpl,
      }),
    bare: (fetchImpl) =>
      openAiCompatProvider({
        name: "openaiCompat",
        baseUrl: COMPAT_URL,
        model: "",
        apiKey: null,
        fetchImpl,
      }),
    request: baseRequest,
    bareRequest: baseRequest,
    ok: {
      complete: () =>
        json({
          choices: [{ message: { content: TEXT } }],
          usage: { prompt_tokens: 11, completion_tokens: 7 },
        }),
      stream: () => sse(...STREAM_PARTS),
      health: () => json({ data: [{ id: "m1" }] }),
    },
    abortable: true,
    bareHealthOk: false,
  },
  {
    label: "gemini",
    network: true,
    ready: (fetchImpl) => geminiProvider({ apiKey: "key", model: MODEL, fetchImpl }),
    bare: (fetchImpl) => geminiProvider({ apiKey: null, model: "", fetchImpl }),
    request: baseRequest,
    bareRequest: baseRequest,
    ok: {
      complete: () =>
        json({
          candidates: [{ content: { parts: [{ text: TEXT }] } }],
          usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7 },
        }),
      // This adapter does not stream, so it has no stream response to answer with.
      health: () => json({ models: [{ name: "m1" }, { name: "m2" }] }),
    },
    abortable: true,
    bareHealthOk: false,
  },
  {
    label: "ollama",
    network: true,
    ready: (fetchImpl) => ollamaProvider({ baseUrl: OLLAMA_URL, model: MODEL, fetchImpl }),
    bare: (fetchImpl) => ollamaProvider({ baseUrl: "", model: "", fetchImpl }),
    request: baseRequest,
    bareRequest: baseRequest,
    ok: {
      complete: () => json({ message: { content: TEXT }, prompt_eval_count: 11, eval_count: 7 }),
      stream: () => ndjson(...STREAM_PARTS),
      health: () => json({ models: [{ name: MODEL }] }),
    },
    abortable: true,
    bareHealthOk: false,
  },
  {
    label: "mock",
    network: false,
    ready: () => mockProvider(),
    bare: () => mockProvider(),
    request: (over = {}) => baseRequest({ mock: () => TEXT, ...over }),
    bareRequest: (over = {}) => baseRequest(over),
    ok: {
      // Never used: the mock has no endpoint to stub.
      complete: () => json(null),
      health: () => json(null),
    },
    abortable: false,
    bareHealthOk: true,
  },
];

/** Records what was sent, and honours an already-aborted signal the way the network would. */
function recordingFetch(subject: Subject) {
  const calls: { url: string; init?: RequestInit | undefined }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    if (init?.signal?.aborted) {
      const err = new Error("The operation was aborted.");
      err.name = "AbortError";
      throw err;
    }
    calls.push({ url: String(input), init });

    if (init?.method !== "POST") return subject.ok.health();

    const body = init?.body ? (JSON.parse(String(init.body)) as { stream?: boolean }) : {};
    if (body.stream) {
      if (!subject.ok.stream)
        throw new Error(`${subject.label}: sent a stream request it cannot answer`);
      return subject.ok.stream();
    }
    return subject.ok.complete();
  };
  return { calls, fetchImpl };
}

/** Await a failure and fail loudly if it was the wrong kind, or did not fail at all. */
async function failure(run: () => Promise<unknown>): Promise<AiError> {
  const resolved = Symbol("resolved");
  const outcome = await run().then(
    () => resolved,
    (err: unknown) => err,
  );

  if (outcome === resolved) throw new Error("expected the call to fail, but it resolved");
  if (!(outcome instanceof AiError))
    throw new Error(`expected an AiError, received ${String(outcome)}`);
  return outcome;
}

describe.each(subjects)("$label adapter", (s) => {
  it("completes with an AiResult naming the model it used", async () => {
    const { calls, fetchImpl } = recordingFetch(s);
    const provider = s.ready(fetchImpl);
    const result = await provider.complete(s.request());

    expect(result.text).toBe(TEXT);
    expect(result.model).toBe(provider.model);
    expect(Number.isInteger(result.tokensIn)).toBe(true);
    expect(result.tokensIn).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.tokensOut)).toBe(true);
    expect(result.tokensOut).toBeGreaterThanOrEqual(0);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    // The mock answers in-process; everyone else must have gone to an endpoint.
    expect(calls.length > 0).toBe(s.network);
  });

  it("refuses a bare build as not_configured, without a round trip", async () => {
    const { calls, fetchImpl } = recordingFetch(s);
    const err = await failure(() => s.bare(fetchImpl).complete(s.bareRequest()));

    expect(err).toBeInstanceOf(AiError);
    expect(err.code).toBe("not_configured");
    expect(err.message.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(0);
  });

  it("answers health without throwing, reporting its own name", async () => {
    const provider = s.ready(s.network ? recordingFetch(s).fetchImpl : undefined);
    const health = await provider.health();

    expect(health.provider).toBe(provider.name);
    expect(typeof health.ok).toBe("boolean");
    expect(health.ok).toBe(true);
    if (health.latencyMs !== undefined) expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("says so without throwing when nothing is configured", async () => {
    const provider = s.bare(unreachable);
    const health = await provider.health();

    expect(health.ok).toBe(s.bareHealthOk);
    expect(health.provider).toBe(provider.name);
    if (!s.bareHealthOk) expect(health.detail).toBeTruthy();
  });

  it("exposes a stream exactly when the adapter implements one", () => {
    const provider = s.ready();
    expect(typeof provider.stream === "function").toBe(Boolean(s.ok.stream));
  });

  it.skipIf(!s.ok.stream)("yields deltas that reassemble to the answer", async () => {
    const provider = s.ready(recordingFetch(s).fetchImpl);
    const parts: string[] = [];
    for await (const delta of provider.stream!(s.request())) parts.push(delta);

    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("")).toBe(TEXT);
  });

  it.skipIf(!s.network)("sends its model and the prompt to the endpoint", async () => {
    const { calls, fetchImpl } = recordingFetch(s);
    await s.ready(fetchImpl).complete(s.request());

    const post = calls.find((c) => c.init?.method === "POST");
    expect(post).toBeDefined();
    // The model rides in the body on OpenAI-shaped APIs and in the path on Gemini's.
    expect(post!.url + String(post!.init?.body)).toContain(MODEL);
    expect(String(post!.init?.body)).toContain("book on a table");
  });

  it.skipIf(!s.network)("fails as provider_failed when the endpoint rejects", async () => {
    const err = await failure(() => s.ready(rejecting).complete(s.request()));

    expect(err.code).toBe("provider_failed");
    expect(err.detail).toBeTruthy();
  });

  it.skipIf(!s.network)("fails as provider_failed when nothing answers", async () => {
    const err = await failure(() => s.ready(unreachable).complete(s.request()));

    expect(err.code).toBe("provider_failed");
    expect(err.detail).toContain("ECONNREFUSED");
  });

  it.skipIf(!s.abortable)("reports aborted when the caller stops it", async () => {
    const { fetchImpl } = recordingFetch(s);
    const err = await failure(() =>
      s.ready(fetchImpl).complete(s.request({ signal: AbortSignal.abort() })),
    );

    expect(err.code).toBe("aborted");
    expect(aiErrorStatus(err.code)).toBe(400);
  });
});

describe("the shared OpenAI-compatible path", () => {
  const groq = (fetchImpl: typeof fetch) =>
    groqProvider({ apiKey: "key", model: MODEL, fetchImpl });

  it("carries the endpoint's own words into the failure detail", async () => {
    const err = await failure(() => groq(rejecting).complete(baseRequest()));

    expect(err.code).toBe("provider_failed");
    expect(err.message).toBe("The model rejected the request.");
    expect(err.detail).toContain("Invalid API key");
  });

  it("puts the provider-agnostic JSON instruction ahead of the prompt", async () => {
    let sent: { messages?: { role: string; content: string }[] } | undefined;
    const provider = groq(async (_input, init) => {
      sent = JSON.parse(String(init?.body)) as typeof sent;
      return json({ choices: [{ message: { content: "{}" } }] });
    });

    await provider.complete(baseRequest({ json: true }));

    expect(sent?.messages?.[0]?.role).toBe("system");
    expect(sent?.messages?.[0]?.content ?? "").toContain("single valid JSON object");
    expect(sent?.messages?.at(-1)?.content ?? "").toContain("book on a table");
  });

  it("reassembles a frame the transport split in half", async () => {
    const payload =
      STREAM_PARTS.map(
        (d) => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`,
      ).join("") + "data: [DONE]\n\n";
    const cut = Math.floor(payload.length / 2);
    const encoder = new TextEncoder();
    const split: string[] = [];

    const provider = groq(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoder.encode(payload.slice(0, cut)));
              controller.enqueue(encoder.encode(payload.slice(cut)));
              controller.close();
            },
          }),
          { status: 200 },
        ),
    );

    for await (const delta of provider.stream!(baseRequest())) split.push(delta);

    expect(split.join("")).toBe(TEXT);
  });
});

describe("mock adapter", () => {
  it("answers identically every time", async () => {
    const provider = mockProvider();
    const first = await provider.complete(baseRequest({ mock: () => TEXT }));
    const second = await provider.complete(baseRequest({ mock: () => TEXT }));

    expect(second.text).toBe(first.text);
    expect(second.model).toBe(first.model);
    expect(second.tokensIn).toBe(first.tokensIn);
    expect(second.tokensOut).toBe(first.tokensOut);
  });

  it("estimates tokens from characters, so a ledger is still a ledger", async () => {
    const promptChars = PROMPT.reduce((sum, message) => sum + message.content.length, 0);
    const result = await mockProvider().complete(baseRequest({ mock: () => "abcdefgh" }));

    expect(result.tokensOut).toBe(2);
    expect(result.tokensIn).toBe(Math.ceil(promptChars / 4));
  });

  it("refuses a prompt that has no golden answer, naming why", async () => {
    const err = await failure(() => mockProvider().complete(baseRequest()));

    expect(err.code).toBe("not_configured");
    expect(err.message).toContain("golden");
  });
});

describe("failure codes", () => {
  it.each([
    ["source_not_found", 404],
    ["aborted", 400],
    ["not_configured", 403],
    ["cap_reached", 402],
    ["invalid_output", 409],
    ["provider_failed", 502],
  ] as const)("maps %s to HTTP %i", (code, status) => {
    expect(aiErrorStatus(code)).toBe(status);
  });
});

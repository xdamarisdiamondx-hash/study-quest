/**
 * AI action routes (P5 action bar).
 *
 * These are thin wrappers around the orchestrator in `ai/run.ts`.
 */
import { Hono } from "hono";

import {
  aiSettingsSchema,
  generateExplainSchema,
  generateSummarySchema,
  type AiSettings,
} from "@sq/core/schemas/ai";
import { notes } from "@sq/db/schema";

import { requireProfile, type ProfileEnv } from "../auth/currentProfile.ts";
import { db } from "../db.ts";
import { and, eq } from "drizzle-orm";
import { runPrompt, streamPrompt, type StreamOutcome } from "../ai/run.ts";

export const aiRouter = new Hono<ProfileEnv>();

/**
 * Replay a text stream as server-sent events.
 *
 * The client reads this with fetch + a reader rather than EventSource, because the request
 * carries a JSON body and EventSource cannot send one. Two event shapes are emitted:
 * `{delta}` as text arrives, then either `{done, ...outcome}` so the caller learns whether
 * the answer came from cache, or `{error}` if generation stopped part-way.
 *
 * A partially streamed answer is never reported as a result — `streamPrompt` throws away
 * its own partial output for the same reason.
 */
function sseResponse(gen: AsyncGenerator<string, StreamOutcome>): Response {
  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        if (cancelled) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      try {
        for (;;) {
          const next = await gen.next();
          if (next.done) {
            send({ done: true, ...next.value });
            break;
          }
          send({ delta: next.value });
        }
      } catch (err) {
        send({ error: err instanceof Error ? err.message : "Generation failed." });
      } finally {
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
      // The reader walked away (Stop, or a closed tab): drop the provider call.
      void gen.return(undefined as unknown as StreamOutcome);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

aiRouter.use("*", async (c, next) => {
  const denied = await requireProfile(c);
  if (denied) return denied;
  await next();
});

/** Verify note ownership */
async function ownsNote(profileId: string, noteId: string) {
  const [note] = await db.orm
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, profileId)))
    .limit(1);
  return note ?? null;
}

/* --- Summarise ----------------------------------------------------------- */

aiRouter.post("/summarise", async (c) => {
  const profileId = c.get("profileId");
  const body = await c.req.json().catch(() => ({}));
  const parsed = generateSummarySchema.safeParse(body);
  if (!parsed.success)
    return c.json(
      { error: "invalid", issues: parsed.error.issues.map((i: { message: string }) => i.message) },
      400,
    );

  const note = await ownsNote(profileId, parsed.data.noteId);
  if (!note) return c.json({ error: "not_found" }, 404);

  const opts = {
    profileId,
    key: "summary.v1" as const,
    input: {
      title: note.title,
      bodyMd: note.bodyMd,
      length: parsed.data.length,
      format: parsed.data.format,
    },
    sourceId: note.id,
    sourceType: "note" as const,
    options: { length: parsed.data.length, format: parsed.data.format },
    // Regenerate bypasses the cache (ADR-008); every other call should hit it.
    fresh: body.fresh === true,
    ...(body.stream === true ? { signal: c.req.raw.signal } : {}),
  };

  if (body.stream === true) return sseResponse(streamPrompt(opts));

  const result = await runPrompt(opts);
  return c.json({ text: result.text, artifactId: result.artifactId, cached: result.cached });
});

/* --- Explain ------------------------------------------------------------- */

aiRouter.post("/explain", async (c) => {
  const profileId = c.get("profileId");
  const body = await c.req.json().catch(() => ({}));
  const parsed = generateExplainSchema.safeParse(body);
  if (!parsed.success)
    return c.json(
      { error: "invalid", issues: parsed.error.issues.map((i: { message: string }) => i.message) },
      400,
    );

  const noteId = body.noteId as string;
  const note = await ownsNote(profileId, noteId);
  if (!note) return c.json({ error: "not_found" }, 404);

  const opts = {
    profileId,
    key: "explain.v1" as const,
    input: {
      text: parsed.data.text,
      context: parsed.data.context ?? note.bodyMd,
      style: parsed.data.style,
    },
    sourceId: note.id,
    sourceType: "note" as const,
    options: { style: parsed.data.style },
    fresh: body.fresh === true,
    ...(body.stream === true ? { signal: c.req.raw.signal } : {}),
  };

  if (body.stream === true) return sseResponse(streamPrompt(opts));

  const result = await runPrompt(opts);
  return c.json({ text: result.text, artifactId: result.artifactId, cached: result.cached });
});

/* --- Read Aloud ---------------------------------------------------------- */

aiRouter.post("/read-aloud", async (c) => {
  const profileId = c.get("profileId");
  const body = await c.req.json().catch(() => ({}));
  const noteId = body.noteId as string;
  if (!noteId) return c.json({ error: "invalid", issues: ["noteId required"] }, 400);

  const note = await ownsNote(profileId, noteId);
  if (!note) return c.json({ error: "not_found" }, 404);

  const { splitSentences } = await import("@sq/core/markdown");
  const sentences = splitSentences(note.bodyMd);

  return c.json({ sentences });
});

/* --- AI Settings --------------------------------------------------------- */

aiRouter.get("/settings", async (c) => {
  const profileId = c.get("profileId");
  const { readAiSettings, chainFor } = await import("../ai/settings.ts");
  const { probeAll } = await import("../ai/registry.ts");
  const { recentArtifacts } = await import("../ai/cache.ts");

  const settings = await readAiSettings(profileId);
  const chain = chainFor(settings);
  const health = await probeAll(settings);
  const recent = await recentArtifacts(profileId, 10);
  // Counted over every artifact, not derived from `recent`: the log is capped at 10 rows, so
  // both the day's total and the month's estimate were silently under-reported by it.
  const { DAILY_AI_CAP, usedToday, monthlyUsage } = await import("../ai/usage.ts");
  const usageToday = await usedToday(profileId);
  const month = await monthlyUsage(profileId);

  return c.json({
    provider: settings.provider,
    model: settings.model,
    hasApiKey: Boolean(settings.apiKey),
    envHasApiKey: ["groq", "gemini"].some((p) =>
      Boolean(process.env[`${p.toUpperCase()}_API_KEY`]),
    ),
    enabled: settings.enabled,
    chain,
    dailyCap: DAILY_AI_CAP,
    usedToday: usageToday,
    monthStart: month.monthStart,
    generationsThisMonth: month.generations,
    tokensInThisMonth: month.tokensIn,
    tokensOutThisMonth: month.tokensOut,
    estimatedCostUsdThisMonth: month.estimatedCostUsd,
    recent: recent.map((r) => ({
      id: r.id,
      kind: r.kind,
      provider: r.provider,
      model: r.model,
      promptVersion: r.promptVersion,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      costCents: r.costCents,
      createdAt: r.createdAt.toISOString(),
    })),
    health: health.map(
      (h: {
        provider: string;
        ok: boolean;
        model?: string;
        detail?: string;
        latencyMs?: number;
      }) => ({
        provider: h.provider,
        ok: h.ok,
        model: h.model,
        detail: h.detail,
        latencyMs: h.latencyMs,
      }),
    ),
  });
});

aiRouter.patch("/settings", async (c) => {
  const profileId = c.get("profileId");
  const body = await c.req.json().catch(() => ({}));
  const { readAiSettings, writeAiSettings } = await import("../ai/settings.ts");

  const patch: Partial<AiSettings> = {};
  if (body.provider !== undefined) patch.provider = body.provider;
  if (body.model !== undefined) patch.model = body.model;
  if (body.apiKey !== undefined) patch.apiKey = body.apiKey;
  if (body.enabled !== undefined) patch.enabled = body.enabled;

  // Every later read parses the stored blob, and one it cannot parse falls back to the
  // defaults — so an over-long model name would have quietly reset the provider choice as
  // well. Validate the merged result rather than the patch alone, so an untouched field can
  // never be what fails.
  const current = await readAiSettings(profileId);
  const parsed = aiSettingsSchema.safeParse({ ...current, ...patch });
  if (!parsed.success)
    return c.json(
      { error: "invalid", issues: parsed.error.issues.map((i: { message: string }) => i.message) },
      400,
    );

  const updated = await writeAiSettings(profileId, parsed.data);
  return c.json({
    provider: updated.provider,
    model: updated.model,
    hasApiKey: Boolean(updated.apiKey),
    enabled: updated.enabled,
  });
});

aiRouter.post("/settings/test", async (c) => {
  const profileId = c.get("profileId");
  const { readAiSettings } = await import("../ai/settings.ts");
  const { probeAll } = await import("../ai/registry.ts");
  const settings = await readAiSettings(profileId);
  const health = await probeAll(settings);
  return c.json({ health });
});

/**
 * AI action routes (P5 action bar).
 *
 * These are thin wrappers around the orchestrator in `ai/run.ts`.
 */
import { Hono } from "hono";

import {
  generateExplainSchema,
  generateFlashcardsSchema,
  generateQuizSchema,
  generateSummarySchema,
  type AiSettings,
} from "@sq/core/schemas/ai";
import { notes } from "@sq/db/schema";

import { requireProfile, type ProfileEnv } from "../auth/currentProfile.ts";
import { db } from "../db.ts";
import { and, eq } from "drizzle-orm";
import { runPrompt } from "../ai/run.ts";

export const aiRouter = new Hono<ProfileEnv>();

aiRouter.use("*", async (c, next) => {
  const denied = await requireProfile(c);
  if (denied) return denied;
  await next();
});

/** Verify note ownership */
async function ownsNote(profileId: string, noteId: string) {
  const [note] = await db.orm.select().from(notes).where(and(eq(notes.id, noteId), eq(notes.userId, profileId))).limit(1);
  return note ?? null;
}

/* --- Summarise ----------------------------------------------------------- */

aiRouter.post("/summarise", async (c) => {
  const profileId = c.get("profileId");
  const parsed = generateSummarySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues.map((i: { message: string }) => i.message) }, 400);

  const note = await ownsNote(profileId, parsed.data.noteId);
  if (!note) return c.json({ error: "not_found" }, 404);

  const result = await runPrompt({
    profileId,
    key: "summary.v1",
    input: {
      title: note.title,
      bodyMd: note.bodyMd,
      length: parsed.data.length,
      format: parsed.data.format,
    },
    sourceId: note.id,
    sourceType: "note",
    options: { length: parsed.data.length, format: parsed.data.format },
  });

  return c.json({ text: result.text, artifactId: result.artifactId, cached: result.cached });
});

/* --- Explain ------------------------------------------------------------- */

aiRouter.post("/explain", async (c) => {
  const profileId = c.get("profileId");
  const body = await c.req.json().catch(() => ({}));
  const parsed = generateExplainSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues.map((i: { message: string }) => i.message) }, 400);

  const noteId = body.noteId as string;
  const note = await ownsNote(profileId, noteId);
  if (!note) return c.json({ error: "not_found" }, 404);

  const result = await runPrompt({
    profileId,
    key: "explain.v1",
    input: {
      text: parsed.data.text,
      context: parsed.data.context ?? note.bodyMd,
      style: parsed.data.style,
    },
    sourceId: note.id,
    sourceType: "note",
    options: { style: parsed.data.style },
  });

  return c.json({ text: result.text, artifactId: result.artifactId, cached: result.cached });
});

/* --- Quiz ---------------------------------------------------------------- */

aiRouter.post("/quiz", async (c) => {
  const profileId = c.get("profileId");
  const parsed = generateQuizSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues.map((i: { message: string }) => i.message) }, 400);

  const note = await ownsNote(profileId, parsed.data.noteId);
  if (!note) return c.json({ error: "not_found" }, 404);

  const result = await runPrompt({
    profileId,
    key: "quiz.v1",
    input: {
      title: note.title,
      bodyMd: note.bodyMd,
      questionCount: parsed.data.questionCount,
      difficulty: parsed.data.difficulty,
      types: parsed.data.types,
    },
    sourceId: note.id,
    sourceType: "note",
    options: { questionCount: parsed.data.questionCount, difficulty: parsed.data.difficulty, types: parsed.data.types },
  });

  return c.json({ quiz: result.value, artifactId: result.artifactId, cached: result.cached });
});

/* --- Flashcards ---------------------------------------------------------- */

aiRouter.post("/flashcards", async (c) => {
  const profileId = c.get("profileId");
  const parsed = generateFlashcardsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues.map((i: { message: string }) => i.message) }, 400);

  const note = await ownsNote(profileId, parsed.data.noteId);
  if (!note) return c.json({ error: "not_found" }, 404);

  const result = await runPrompt({
    profileId,
    key: "flashcards.v1",
    input: {
      title: note.title,
      bodyMd: note.bodyMd,
      cardCount: parsed.data.cardCount,
    },
    sourceId: note.id,
    sourceType: "note",
    options: { cardCount: parsed.data.cardCount },
  });

  return c.json({ deck: result.value, artifactId: result.artifactId, cached: result.cached });
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
  const usedToday = recent.filter((r) => {
    const date = new Date(r.createdAt);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }).length;

  return c.json({
    provider: settings.provider,
    model: settings.model,
    hasApiKey: Boolean(settings.apiKey),
    envHasApiKey: ["groq", "gemini"].some((p) => Boolean(process.env[`${p.toUpperCase()}_API_KEY`])),
    enabled: settings.enabled,
    chain,
    dailyCap: 40,
    usedToday,
    generationsThisMonth: recent.length,
    estimatedCostCentsThisMonth: recent.reduce((sum, r) => sum + r.costCents, 0),
    monthStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
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
    health: health.map((h: { provider: string; ok: boolean; model?: string; detail?: string; latencyMs?: number }) => ({
      provider: h.provider,
      ok: h.ok,
      model: h.model,
      detail: h.detail,
      latencyMs: h.latencyMs,
    })),
  });
});

aiRouter.patch("/settings", async (c) => {
  const profileId = c.get("profileId");
  const body = await c.req.json().catch(() => ({}));
  const { writeAiSettings } = await import("../ai/settings.ts");

  const patch: Partial<AiSettings> = {};
  if (body.provider) patch.provider = body.provider;
  if (body.model !== undefined) patch.model = body.model;
  if (body.apiKey !== undefined) patch.apiKey = body.apiKey;
  if (body.enabled !== undefined) patch.enabled = body.enabled;

  const updated = await writeAiSettings(profileId, patch);
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
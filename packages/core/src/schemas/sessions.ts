/**
 * Session contracts (P14): what the session router accepts and what the web
 * client sends — one Zod source for both sides (ADR-010), same as `schemas/plan`.
 *
 * Start names the mode and its scope; the *server* assembles a guided session's
 * steps from the topic's actual material, so titles and stage order cannot drift
 * from the engine's catalogue. Ending reports only the pause the server cannot
 * see — the wall time comes from the server's own timestamps.
 */
import { z } from "zod";

import { SESSION_MODES } from "../sessions/index.ts";

export const sessionModeSchema = z.enum(SESSION_MODES);

export const createSessionSchema = z
  .object({
    mode: sessionModeSchema,
    /** Scope is what the session studies: at least guided demands a topic. */
    subjectId: z.string().uuid().optional(),
    topicId: z.string().uuid().optional(),
    taskId: z.string().uuid().optional(),
    /** Focus sessions count down to this; quick/guided only record the plan. */
    plannedMin: z.number().int().min(0).max(480).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "guided" && !v.topicId)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["topicId"], message: "topicId required" });
  });

/**
 * Pomodoro breaks are deliberately not part of `createSession`: they change
 * what the clock *shows*, not what the session records, so they live with the
 * client's timer state (localStorage) instead of a column.

/** What only the client can know at the end: time spent paused. */
export const endSessionSchema = z.object({
  pausedMin: z.number().int().min(0).max(1440).default(0),
});

/** Guided stages are marked by the student as each one is done. */
export const sessionStepSchema = z.object({
  status: z.enum(["done", "pending"]),
});

export type CreateSession = z.infer<typeof createSessionSchema>;
export type EndSession = z.infer<typeof endSessionSchema>;
export type SessionStepPatch = z.infer<typeof sessionStepSchema>;

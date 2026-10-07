/**
 * Planning contracts (P12): what the plan router accepts and what the web client
 * sends — one Zod source for both sides (ADR-010).
 *
 * The day's plan is keyed by a local calendar date (`YYYY-MM-DD`), the same string
 * `localDate()` produces, because a plan belongs to a day the student lives in —
 * not to a UTC instant that can slip under them at midnight.
 */
import { z } from "zod";

import { BLOCK_KINDS, PLAN_MODES } from "../planning/index.ts";

export const planModeSchema = z.enum(PLAN_MODES);
export const blockKindSchema = z.enum(BLOCK_KINDS);
export const blockStatusSchema = z.enum(["pending", "done", "dismissed"]);

export const planDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const createPlanSchema = z.object({
  date: planDateSchema,
  mode: planModeSchema.optional(),
});

/**
 * Regenerating keeps finished rows (and dismissed candidates) and rebuilds the rest —
 * "keep what you've done" is the default, not an option the student must find.
 */
export const generatePlanSchema = z.object({
  date: planDateSchema,
  mode: planModeSchema.optional(),
  keepDone: z.boolean().default(true),
});

export const addBlocksSchema = z.object({
  date: planDateSchema,
  blocks: z
    .array(
      z.object({
        kind: blockKindSchema,
        refId: z.string().uuid(),
        plannedMin: z.number().int().min(1).max(600),
      }),
    )
    .min(1)
    .max(12),
});

export const updateBlockSchema = z
  .object({
    plannedMin: z.number().int().min(1).max(600).optional(),
    status: blockStatusSchema.optional(),
  })
  .refine((v) => v.plannedMin !== undefined || v.status !== undefined, {
    message: "no changes supplied",
  });

export const reorderPlanSchema = z.object({
  date: planDateSchema,
  ids: z.array(z.string().uuid()).min(1).max(100),
});

export const setModeSchema = z.object({
  date: planDateSchema,
  mode: planModeSchema,
});

/**
 * "Not today" is stored as a dismissed row rather than client state, so the tray
 * stays dismissed across a refresh — and re-offered on a fresh day (A.8).
 */
export const dismissCandidateSchema = z.object({
  date: planDateSchema,
  taskId: z.string().uuid(),
});

/** Available study time lives in settings — global, not per-day. */
export const capacitySchema = z.object({
  minutes: z.number().int().min(15).max(600),
});

export type CreatePlan = z.infer<typeof createPlanSchema>;
export type GeneratePlan = z.infer<typeof generatePlanSchema>;
export type AddBlocks = z.infer<typeof addBlocksSchema>;
export type UpdateBlock = z.infer<typeof updateBlockSchema>;
export type ReorderPlan = z.infer<typeof reorderPlanSchema>;
export type SetMode = z.infer<typeof setModeSchema>;
export type DismissCandidate = z.infer<typeof dismissCandidateSchema>;
export type Capacity = z.infer<typeof capacitySchema>;

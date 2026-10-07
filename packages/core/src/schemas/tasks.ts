/**
 * Task contracts (P11, PRD sections 15–16).
 *
 * Shared between the server (route validation) and the web client (API types). The
 * recurrence rule mirrors `@sq/core/tasks`' RecurrenceRule in serialised form: an
 * instant is an ISO string, not a Date, so it survives JSON both ways.
 */
import { z } from "zod";

import { TASK_KINDS, TASK_PRIORITIES } from "../tasks/index.ts";

/** The serialised form of an rrule-lite rule (ADR-017). */
export const recurrenceSchema = z.object({
  freq: z.enum(["daily", "weekly", "monthly"]),
  interval: z.number().int().min(1).max(365),
  /** Weekdays as 0 (Sun) … 6 (Sat), comma-separated — empty means "the anchor's day". */
  byWeekday: z.string().max(13),
  untilAt: z.string().datetime().nullable(),
});
export type Recurrence = z.infer<typeof recurrenceSchema>;

/** The same rule as accepted from a client; fields may be omitted and get defaults. */
export const recurrenceInputSchema = z.object({
  freq: z.enum(["daily", "weekly", "monthly"]),
  interval: z.number().int().min(1).max(365).optional(),
  byWeekday: z
    .string()
    .regex(/^([0-6])(,[0-6])*$/, "Weekdays look like 1,3,5")
    .optional(),
  untilAt: z.string().datetime().nullable().optional(),
});
export type RecurrenceInput = z.infer<typeof recurrenceInputSchema>;

export const taskSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().max(200),
  subjectId: z.string().uuid().nullable(),
  topicId: z.string().uuid().nullable(),
  kind: z.enum(TASK_KINDS),
  priority: z.enum(TASK_PRIORITIES),
  dueAt: z.string().datetime().nullable(),
  estimateMin: z.number().int().nonnegative(),
  notes: z.string().nullable(),
  status: z.enum(["open", "done", "skipped"]),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  /** Set on every row of a recurring series, head included. */
  recurrenceId: z.string().uuid().nullable(),
  /** The row's series rule, joined in — null for a one-off task. */
  rule: recurrenceSchema.nullable(),
});
export type Task = z.infer<typeof taskSchema>;

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1, "A task needs a title").max(200),
    subjectId: z.string().uuid().nullable().optional(),
    topicId: z.string().uuid().nullable().optional(),
    kind: z.enum(TASK_KINDS).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    dueAt: z.string().datetime().nullable().optional(),
    estimateMin: z.number().int().min(0).max(10_080).optional(),
    notes: z.string().max(2_000).nullable().optional(),
    recurrence: recurrenceInputSchema.optional(),
  })
  .refine((v) => !v.recurrence || v.dueAt, {
    message: "A repeating task needs a first date",
    path: ["recurrence"],
  });
export type CreateTask = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    subjectId: z.string().uuid().nullable().optional(),
    topicId: z.string().uuid().nullable().optional(),
    kind: z.enum(TASK_KINDS).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    dueAt: z.string().datetime().nullable().optional(),
    estimateMin: z.number().int().min(0).max(10_080).optional(),
    notes: z.string().max(2_000).nullable().optional(),
    /** Replaces the series rule (series edits only; see the tasks route). */
    recurrence: recurrenceInputSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type UpdateTask = z.infer<typeof updateTaskSchema>;

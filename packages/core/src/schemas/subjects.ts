import { z } from "zod";

/** Topic learning state (section 6, section 25). */
export const topicStatusSchema = z.enum(["not_started", "learning", "mastered"]);
export type TopicStatus = z.infer<typeof topicStatusSchema>;

export const TOPIC_STATUSES: TopicStatus[] = ["not_started", "learning", "mastered"];

export const TOPIC_STATUS_LABEL: Record<TopicStatus, string> = {
  not_started: "Not started",
  learning: "Learning",
  mastered: "Mastered",
};

/* --- subjects ------------------------------------------------------------ */

export const subjectSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1, "Give the subject a name").max(80, "Keep the name under 80 characters"),
  monogram: z.string().min(1).max(3),
  icon: z.string().max(40).nullable(),
  orderIndex: z.number().int().nonnegative(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type Subject = z.infer<typeof subjectSchema>;

export const subjectSummarySchema = subjectSchema.extend({
  topicCount: z.number().int().nonnegative(),
  progress: z.number().min(0).max(1),
  archived: z.boolean(),
});
export type SubjectSummary = z.infer<typeof subjectSummarySchema>;

export const createSubjectSchema = z.object({
  name: z.string().min(1, "Give the subject a name").max(80),
  /** Optional override; otherwise derived from the name. */
  monogram: z.string().min(1).max(3).optional(),
  icon: z.string().max(40).optional(),
});
export type CreateSubject = z.infer<typeof createSubjectSchema>;

export const updateSubjectSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    monogram: z.string().min(1).max(3).optional(),
    icon: z.string().max(40).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type UpdateSubject = z.infer<typeof updateSubjectSchema>;

/** Reorder: the ids in the order they should appear. */
export const reorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Nothing to reorder"),
});
export type Reorder = z.infer<typeof reorderSchema>;

/** Import one or more starter templates by name (section 6). */
export const importTemplatesSchema = z.object({
  subjects: z.array(z.string().min(1)).min(1, "Pick at least one subject"),
});
export type ImportTemplates = z.infer<typeof importTemplatesSchema>;

/* --- topics -------------------------------------------------------------- */

export const topicSchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().nullable(),
  orderIndex: z.number().int().nonnegative(),
  status: topicStatusSchema,
  progressCache: z.number(),
  lastStudiedAt: z.string().datetime().nullable(),
});
export type Topic = z.infer<typeof topicSchema>;

export const createTopicSchema = z.object({
  name: z.string().min(1, "Give the topic a name").max(120),
  description: z.string().max(500).optional(),
  status: topicStatusSchema.optional(),
});
export type CreateTopic = z.infer<typeof createTopicSchema>;

export const updateTopicSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    status: topicStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type UpdateTopic = z.infer<typeof updateTopicSchema>;

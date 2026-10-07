/**
 * Quest contracts (P13): what the quest router accepts and what the web client
 * sends — one Zod source for both sides (ADR-010), same as `schemas/plan`.
 *
 * Creation is template-first: the client names a template and its scope, the
 * *server* resolves the steps from `templateSteps` so titles, order and ref types
 * cannot be forged or drifted apart from the engine's catalogue.
 */
import { z } from "zod";

import { QUEST_KINDS } from "../quests/index.ts";

export const questKindSchema = z.enum(QUEST_KINDS);
const planDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

/**
 * What each template must collect (mirrors `QuestTemplate.needs`):
 * topic → a topicId, subject/exam → a subjectId (exam also a date),
 * weekly → an optional target, personal → a title and at least one step.
 */
export const createQuestSchema = z
  .object({
    template: questKindSchema,
    title: z.string().trim().min(1).max(80).optional(),
    topicId: z.string().uuid().optional(),
    subjectId: z.string().uuid().optional(),
    examDate: planDate.optional(),
    target: z.number().int().min(1).max(30).optional(),
    steps: z
      .array(z.object({ title: z.string().trim().min(1).max(100) }))
      .min(1)
      .max(8)
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.template === "topic" && !v.topicId)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["topicId"], message: "topicId required" });
    if ((v.template === "subject" || v.template === "exam") && !v.subjectId)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subjectId"],
        message: "subjectId required",
      });
    if (v.template === "exam" && !v.examDate)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["examDate"],
        message: "examDate required",
      });
    if (v.template === "personal") {
      if (!v.title)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["title"], message: "title required" });
      if (!v.steps?.length)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["steps"], message: "steps required" });
    }
  });

/**
 * Declining an offer stores a declined quest row for that scope — the offer rule
 * reads it back and never asks about that scope again (PRD §21).
 */
export const declineOfferSchema = z.object({
  template: z.enum(["topic", "subject"]),
  scopeId: z.string().uuid(),
  title: z.string().trim().min(1).max(80),
});

/**
 * The only quest signals the *client* may send: "the student looked at this".
 * Quiz and flashcard signals never travel this way — the server hooks them off
 * the objective success events themselves (PRD A.8).
 */
export const questSignalSchema = z.object({
  type: z.enum(["notes_opened", "summary"]),
  topicId: z.string().uuid(),
});

export type CreateQuest = z.infer<typeof createQuestSchema>;
export type DeclineOffer = z.infer<typeof declineOfferSchema>;
export type QuestSignal = z.infer<typeof questSignalSchema>;

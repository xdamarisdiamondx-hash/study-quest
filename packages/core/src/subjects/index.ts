/**
 * Subject and topic domain helpers (PRD section 6).
 *
 * Relative imports carry the `.ts` extension: the server runs these files directly under
 * `node --experimental-strip-types`, which does not rewrite extensions the way a bundler
 * would.
 */
export { applyReorder, move, nudge, resequence } from "./order.ts";
export type { Ordered } from "./order.ts";

export { STARTER_SUBJECTS, monogramFor } from "../starter/index.ts";
export type { StarterSubject, StarterTopic } from "../starter/index.ts";

export {
  TOPIC_STATUSES,
  TOPIC_STATUS_LABEL,
  createSubjectSchema,
  createTopicSchema,
  importTemplatesSchema,
  reorderSchema,
  subjectSchema,
  subjectSummarySchema,
  topicSchema,
  topicStatusSchema,
  updateSubjectSchema,
  updateTopicSchema,
} from "../schemas/subjects.ts";
export type {
  CreateSubject,
  CreateTopic,
  ImportTemplates,
  Reorder,
  Subject,
  SubjectSummary,
  Topic,
  TopicStatus,
  UpdateSubject,
  UpdateTopic,
} from "../schemas/subjects.ts";

import type { TopicStatus } from "../schemas/subjects.ts";

/**
 * The next status in the learning journey, used by the one-tap "I am studying this" action.
 * Wraps at the end so the cycle never dead-ends.
 */
export function nextTopicStatus(current: TopicStatus): TopicStatus {
  switch (current) {
    case "not_started":
      return "learning";
    case "learning":
      return "mastered";
    case "mastered":
      return "learning";
  }
}

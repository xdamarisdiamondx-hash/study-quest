/**
 * Placeholder data for the shell.
 *
 * Subjects, topics and subject progress are real as of P4 — those come from
 * `lib/useSubjects` and are not mocked here any more. Tasks became real in P11,
 * the daily quest in P12 and XP/levels/streaks in P15; their mocks were deleted
 * with them. What remains below is everything whose phase has not landed.
 *
 * Each export is removed the moment its phase ships, so a stale mock cannot masquerade
 * as a feature that works.
 */

export const recommendation = {
  text: "You scored 5/10 on Motion. Try a quick review?",
  cta: "Start review",
};

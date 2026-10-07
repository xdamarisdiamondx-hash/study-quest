/**
 * The "Next up" strip (P17): one compact line after a completed activity —
 * the top `after` suggestion, already ranked by the server, rendered as text
 * plus a single link so the next action costs one tap (plan exit criterion).
 *
 * It shares the after-context query with every other surface, so the quiz
 * results, the session summary, the deck-done panel and the quest dialog all
 * agree on what comes next. `exclude` drops codes whose answer is already on
 * the screen — retrying the quiz you just took, or taking the quiz you are
 * looking at — instead of printing a suggestion the student cannot use.
 */
import { Link } from "react-router-dom";
import type { RecommendationCode } from "@sq/core/planning";

import { useRecommendations } from "./useRecommendations";

export function NextUpStrip({ exclude = [] }: { exclude?: readonly RecommendationCode[] }) {
  const { data } = useRecommendations("after");
  const top = data?.suggestions.find((s) => !exclude.includes(s.code));
  if (!top) return null;

  return (
    <div className="sq-nextup">
      <span className="sq-nextup-label">Next up</span>
      <span className="sq-nextup-text">{top.text}</span>
      <Link className="sq-btn sq-btn-secondary sq-btn-sm" to={top.href}>
        {top.action}
      </Link>
    </div>
  );
}

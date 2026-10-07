/**
 * Typed client for the recommendations API (P17): the Home "What's next" card
 * and the strip that follows a completed activity read the same endpoint with
 * different contexts, so the two surfaces can never rank differently (one
 * engine, one read — ADR-010's contract shape). The server has already
 * applied the cap and today's dismissals; the client only renders.
 */
import type { RecommendationCode } from "@sq/core/planning";

import { ApiError } from "./subjectsApi";

export type RecommendContext = "home" | "after";

export interface Suggestion {
  code: RecommendationCode;
  text: string;
  action: string;
  href: string;
}

export interface RecommendationsView {
  suggestions: Suggestion[];
  generatedAt: string;
}

export async function fetchRecommendations(
  context: RecommendContext,
): Promise<RecommendationsView> {
  const res = await fetch(`/api/recommendations?context=${context}`, {
    credentials: "same-origin",
  });
  if (!res.ok) throw new ApiError("Failed to load suggestions", res.status);
  return res.json() as Promise<RecommendationsView>;
}

/** "Not today" — one idempotent row for the plan day, expiring with the date. */
export async function dismissRecommendation(code: RecommendationCode): Promise<void> {
  const res = await fetch("/api/recommendations/dismiss", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new ApiError("Could not dismiss that suggestion", res.status);
}

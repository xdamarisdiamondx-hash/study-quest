/**
 * Typed client for the search API (P19): the palette, the search page and
 * their recent-search rows all read through here. Hits are the same core
 * type the server ranks with, so a segment the client renders as <mark> is
 * the segment `buildSegments` built — nothing is re-derived in the browser.
 */
import type { SearchHit, SearchType } from "@sq/core/search";

import { ApiError } from "./subjectsApi";

export interface SearchResponse {
  query: string;
  results: SearchHit[];
  /** How many hits matched in total; `results` carries at most the first 30. */
  total: number;
}

export interface RecentSearch {
  query: string;
  at: string;
}

export interface SearchRequest {
  q: string;
  type?: SearchType | null;
  subjectId?: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { issues?: string[] } | null;
    throw new ApiError(detail?.issues?.[0] ?? "Search is unavailable right now", res.status);
  }
  return res.json() as Promise<T>;
}

export const searchApi = {
  search: ({ q, type, subjectId }: SearchRequest) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    if (subjectId) params.set("subjectId", subjectId);
    const qs = params.toString();
    return request<SearchResponse>(`/api/search${qs ? `?${qs}` : ""}`);
  },
  recents: () => request<{ recents: RecentSearch[] }>("/api/search/recent"),
  saveRecent: (q: string) =>
    request<{ ok: boolean }>("/api/search/recent", {
      method: "POST",
      body: JSON.stringify({ q }),
    }),
  clearRecents: () => request<{ ok: boolean }>("/api/search/recent", { method: "DELETE" }),
};

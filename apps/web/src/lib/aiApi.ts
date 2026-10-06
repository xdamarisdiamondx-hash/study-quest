/**
 * Typed client for the AI settings API (P6, ADR-023).
 *
 * Follows `notesApi`'s shape: it does its own fetching with messages written for the screen
 * that will show them, so Settings can say which call failed rather than "request failed".
 *
 * The key is write-only on the server and there is deliberately no field for one here —
 * `.env` is the source of truth for every account, so this page reports *where* the key
 * comes from instead of collecting a second copy of it.
 */
import type { AiHealth, AiProviderName } from "@sq/core/schemas/ai";

import { ApiError } from "./subjectsApi";

/** One row of the generation log the server keeps for this profile. */
export interface AiRecentArtifact {
  id: string;
  kind: string;
  provider: string;
  model: string;
  promptVersion: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  createdAt: string;
}

/** What `GET /api/ai/settings` answers with: stored settings plus what the machine reports. */
export interface AiSettingsView {
  provider: AiProviderName;
  model: string;
  hasApiKey: boolean;
  /** A key exists in `.env` — the zero-configuration path. */
  envHasApiKey: boolean;
  enabled: boolean;
  /** The order providers are actually tried in for this profile. Empty when disabled. */
  chain: AiProviderName[];
  dailyCap: number;
  usedToday: number;
  monthStart: string;
  generationsThisMonth: number;
  tokensInThisMonth: number;
  tokensOutThisMonth: number;
  /** USD, from `estimateCostUsd` — more precise than the per-row cent. */
  estimatedCostUsdThisMonth: number;
  recent: AiRecentArtifact[];
  /** Result of probing every provider in the chain. */
  health: AiHealth[];
}

export interface AiSettingsPatch {
  provider?: AiProviderName;
  model?: string;
  enabled?: boolean;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      issues?: string[];
    } | null;
    const message = body?.issues?.[0] ?? body?.error ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return (await res.json()) as T;
}

export const aiApi = {
  /** Settings plus a fresh probe of every provider — this call is the slow one. */
  settings: () => call<AiSettingsView>("/api/ai/settings"),

  update: (patch: AiSettingsPatch) =>
    call<{ provider: AiProviderName; model: string; hasApiKey: boolean; enabled: boolean }>(
      "/api/ai/settings",
      { method: "PATCH", body: JSON.stringify(patch) },
    ),

  /** Re-run `health()` on every provider without re-reading anything else. */
  test: () => call<{ health: AiHealth[] }>("/api/ai/settings/test", { method: "POST" }),
};

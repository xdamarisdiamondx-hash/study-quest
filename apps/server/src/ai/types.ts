/**
 * The provider layer (P6, ADR-006).
 *
 * Everything above this file deals in `AiProvider` — no feature code ever learns which
 * model produced a result, which is the whole point of the adapter (ADR-006) and what makes
 * "switching providers changes no UI" testable rather than aspirational.
 */
import type { AiHealth, AiKind, AiProviderName } from "@sq/core/schemas/ai";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface AiRequest {
  messages: ChatMessage[];
  /** Ask the provider for a JSON object (used for quizzes, flashcards and repairs). */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /**
   * Deterministic answer used only by the `mock` adapter. The prompt registry owns the
   * golden output (one per prompt), so the mock stays a real adapter without any prompt
   * knowledge of its own.
   */
  mock?: () => unknown;
}

export interface AiResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

/** ADR-006. `configured` is about credentials, not about reachability — `health()` asks that. */
export interface AiProvider {
  readonly name: AiProviderName;
  /** The model this adapter will call, before any per-request override. */
  readonly model: string;
  readonly configured: boolean;
  complete(req: AiRequest): Promise<AiResult>;
  /** Present only for providers that can stream; the UI falls back to whole-text otherwise. */
  stream?(req: AiRequest): AsyncIterable<string>;
  health(): Promise<AiHealth>;
}

export type AiErrorCode =
  /** ADR-007: nothing in the chain has credentials, so the UI offers setup instead. */
  | "not_configured"
  /** ADR-025: the per-user daily generation cap is spent; cached results stay available. */
  | "cap_reached"
  /** Something is configured but every adapter failed — a network or credential problem. */
  | "provider_failed"
  /** Structured output was still invalid after the one repair retry (ADR-009). */
  | "invalid_output"
  | "aborted"
  | "source_not_found";

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly detail?: string;

  constructor(
    code: AiErrorCode,
    message: string,
    detail?: string,
  ) {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.detail = detail;
  }
}

/** HTTP status each failure maps to, so the web client can branch on it. */
export function aiErrorStatus(code: AiErrorCode): 400 | 402 | 403 | 404 | 409 | 502 {
  switch (code) {
    case "source_not_found":
      return 404;
    case "aborted":
      return 400;
    case "not_configured":
      return 403;
    case "cap_reached":
      return 402;
    case "invalid_output":
      return 409;
    default:
      return 502;
  }
}

/** Which phase of the pipeline produced an artifact — logged, never guessed by callers. */
export type AiSourceKind = Extract<AiKind, "summary" | "quiz" | "flashcards" | "explain">;

/**
 * How much model a prompt wants (P6 "model tiers").
 *
 * A summary of your own notes does not need the biggest model in the chain, and paying for
 * one there is exactly the runaway cost ADR-025 exists to prevent. The registry assigns a
 * tier per prompt; Settings can still override the model outright.
 */
export type ModelTier = "fast" | "capable";

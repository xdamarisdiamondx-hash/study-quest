/**
 * Typed client for the LAN access API (P20, ADR-023): status, the PIN unlock,
 * the Settings toggle and PIN rotation. `status` is one of the routes the gate
 * itself leaves open, so it answers even while everything else is locked.
 */
import { ApiError } from "./subjectsApi";

export interface LanStatus {
  enabled: boolean;
  /** True when this browser already holds a valid unlock cookie. */
  unlocked: boolean;
  /** The machine's LAN address, or null when it has no network interface. */
  lanIp: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as {
      error?: string;
      issues?: string[];
    } | null;
    throw new ApiError(
      detail?.issues?.[0] ?? detail?.error ?? "LAN settings are unavailable right now",
      res.status,
    );
  }
  return res.json() as Promise<T>;
}

export const lanApi = {
  status: () => request<LanStatus>("/api/lan/status"),
  unlock: (pin: string) =>
    request<{ ok: boolean }>("/api/lan/unlock", { method: "POST", body: JSON.stringify({ pin }) }),
  toggle: (enabled: boolean) =>
    request<{ status: LanStatus; pin: string | null }>("/api/lan/toggle", {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),
  rotatePin: () => request<{ pin: string }>("/api/lan/pin", { method: "POST" }),
};

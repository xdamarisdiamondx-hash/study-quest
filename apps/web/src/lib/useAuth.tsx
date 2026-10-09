import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { isNetworkError, wipeSessionCaches } from "../offline/session";
import { authClient } from "./authClient";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface Profile {
  displayName: string;
  timezone: string;
  /** True until the account has been through onboarding. */
  needsOnboarding: boolean;
}

type Status = "loading" | "authenticated" | "anonymous";

interface AuthState {
  status: Status;
  user: CurrentUser | null;
  profile: Profile | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface MeResponse {
  user: CurrentUser | null;
  profile: Profile | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
    profile: null,
    refresh: async () => {},
    signOut: async () => {},
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { credentials: "same-origin" });
      const data = (await res.json()) as MeResponse;
      setState((s) => ({
        ...s,
        status: data.user ? "authenticated" : "anonymous",
        user: data.user,
        profile: data.profile,
      }));
    } catch {
      setState((s) => ({ ...s, status: "anonymous", user: null, profile: null }));
    }
  }, []);

  const queryClient = useQueryClient();

  const signOut = useCallback(async () => {
    // The local session ends here whatever the server or its client library
    // answers: the erase flow signs out an account that no longer exists, and
    // no rejection from that call may decide whether the device keeps the old
    // student's cached reads (offline/session.ts). Only a dead network holds
    // back the outbox — queued edits are real in-flight work and the session
    // may still be live — so nothing after the wipe depends on the outcome.
    let offline = false;
    try {
      await authClient.signOut();
    } catch (err) {
      offline = isNetworkError(err);
    }
    await wipeSessionCaches({ holdQueue: offline });
    queryClient.clear(); // in-memory answers too: a fast next sign-in must not see them
    if (!offline) await refresh();
  }, [refresh, queryClient]);

  // Bootstrapping the session on mount is the one case where fetching in an effect is
  // correct: there is no event to fetch from, and no route may render until the app
  // knows whether a session exists. setState happens in the async callback, never
  // synchronously in the effect body.
  useEffect(() => {
    let cancelled = false;

    fetch("/api/me", { credentials: "same-origin" })
      .then((res) => res.json() as Promise<MeResponse>)
      .then((data) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          status: data.user ? "authenticated" : "anonymous",
          user: data.user,
          // Fall back to a profile that forces onboarding rather than trusting a null.
          profile: data.user
            ? (data.profile ?? {
                displayName: data.user.name,
                timezone: "UTC",
                needsOnboarding: true,
              })
            : null,
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setState((s) => ({ ...s, status: "anonymous", user: null, profile: null }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, refresh, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

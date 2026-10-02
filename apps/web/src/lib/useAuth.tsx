import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

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

  const signOut = useCallback(async () => {
    await authClient.signOut();
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <AuthContext.Provider value={{ ...state, refresh, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

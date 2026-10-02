import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../lib/useAuth";

/** Sends anonymous visitors to sign in, preserving where they were going. */
export function RequireAuth() {
  const { status, profile } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="sq-auth">
        <p className="sq-auth-loading">Checking your session…</p>
      </div>
    );
  }

  if (status === "anonymous") {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }

  // A signed-in account that has never finished onboarding goes to onboarding, not Home.
  // `from` is preserved so they land back where they intended after setup.
  if (profile && profile.needsOnboarding && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

/** Keeps a signed-in user off the sign-in screen. */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") return <div className="sq-auth" />;
  if (status === "authenticated") return <Navigate to="/" replace />;
  return <>{children}</>;
}

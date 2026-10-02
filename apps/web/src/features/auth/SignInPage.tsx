import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Logo } from "@sq/ui";

import { authClient } from "../../lib/authClient";
import { useAuth } from "../../lib/useAuth";

type Mode = "sign-in" | "sign-up";

export function SignInPage() {
  const { status, refresh } = useAuth();
  const location = useLocation();

  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === "authenticated") {
    const from = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={from} replace />;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "sign-up") {
        const { error: err } = await authClient.signUp.email({ name, email, password });
        if (err) throw err;
      } else {
        const { error: err } = await authClient.signIn.email({ email, password });
        if (err) throw err;
      }
      await refresh();
    } catch (err) {
      setError(humanise(err));
    } finally {
      setBusy(false);
    }
  }

  function humanise(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err);
    if (/invalid|credential/i.test(message))
      return "That email and password do not match an account.";
    if (/already exists|already registered|unique/i.test(message)) {
      return "An account with that email already exists. Try signing in instead.";
    }
    if (/password/i.test(message)) return message;
    if (/fetch|network|failed to fetch/i.test(message)) {
      return "Could not reach the local server. Start it with `pnpm dev:all`.";
    }
    return message;
  }

  const isSignUp = mode === "sign-up";

  return (
    <main className="sq-auth">
      <div className="sq-ambient" aria-hidden="true" />

      <div className="sq-auth-card">
        <header className="sq-auth-head">
          <Logo size={44} />
          <h1>Study Quest</h1>
          <p>{isSignUp ? "Create your account on this machine" : "Sign in to continue"}</p>
        </header>

        <form onSubmit={onSubmit} noValidate>
          {isSignUp ? (
            <div className="sq-field">
              <label htmlFor="name">Name</label>
              <input
                className="sq-input"
                id="name"
                name="name"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Praise"
              />
            </div>
          ) : null}

          <div className="sq-field">
            <label htmlFor="email">Email</label>
            <input
              className="sq-input"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-describedby={error ? "auth-error" : undefined}
              aria-invalid={error ? true : undefined}
            />
          </div>

          <div className="sq-field">
            <label htmlFor="password">Password</label>
            <input
              className="sq-input"
              id="password"
              name="password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignUp ? "At least 8 characters" : "••••••••"}
              aria-describedby={error ? "auth-error" : "password-help"}
            />
            {isSignUp ? (
              <p className="sq-help" id="password-help">
                At least 8 characters. Stored as a hash on this machine only.
              </p>
            ) : null}
          </div>

          {error ? (
            <p className="sq-error" id="auth-error" role="alert">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7.5v5M12 16h.01" />
              </svg>
              {error}
            </p>
          ) : null}

          <button type="submit" className="sq-btn sq-btn-primary sq-btn-block" disabled={busy}>
            {busy ? "Working…" : isSignUp ? "Create account" : "Sign in"}
          </button>
        </form>

        <div className="sq-auth-switch">
          {isSignUp ? "Already have an account?" : "New here?"}{" "}
          <button
            type="button"
            className="sq-btn sq-btn-ghost sq-btn-sm"
            onClick={() => {
              setMode(isSignUp ? "sign-in" : "sign-up");
              setError(null);
            }}
          >
            {isSignUp ? "Sign in" : "Create an account"}
          </button>
        </div>

        <p className="sq-auth-note">
          Accounts live only on this computer. Sessions are stored in an httpOnly cookie, so no
          token is ever exposed to page scripts.
        </p>
      </div>
    </main>
  );
}

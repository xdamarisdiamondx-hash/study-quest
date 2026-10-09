/**
 * Privacy (P22): what is stored, what leaves the machine, how to delete it all.
 *
 * Public on purpose — a student should be able to read this *before* signing up,
 * and the sign-in screen links straight to it. The two destructive actions only
 * render with a session, and both go through `POST /api/erase` with the literal
 * confirmation the schema demands, so the ask is enforced on the server too.
 *
 * The claims below are the ones the code keeps: no analytics or telemetry exists
 * in this repository, fonts and scripts are self-hosted, and AI text only moves
 * when the student presses a button.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Logo } from "@sq/ui";

import { useAuth } from "../../lib/useAuth";

type Busy = "data" | "account" | null;

export function PrivacyPage() {
  const { status, refresh, signOut } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const signedIn = status === "authenticated";

  async function erase(scope: Exclude<Busy, null>) {
    const ask =
      scope === "data"
        ? "Erase every subject, note, quiz, card, task, session and quest?\n\nYour account stays signed in and onboarding starts again. This cannot be undone — export first if you might want it back."
        : "Delete your account as well?\n\nThis removes your study data AND your email, password and sessions. You will be signed out. This cannot be undone.";
    if (!window.confirm(ask)) return;

    setBusy(scope);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/erase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, confirm: "ERASE" }),
      });
      const body: { message?: string } = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? "The server refused the request.");

      queryClient.clear();
      if (scope === "data") {
        // Blank settings mean needsOnboarding: RequireAuth bounces to /onboarding.
        await refresh();
        navigate("/", { replace: true });
      } else {
        // Stay put: this route is public, so the page now shows the confirmation
        // above its signed-out state instead of dropping the student on sign-in.
        setDone("Everything was deleted. Create a new account whenever you like.");
        await signOut().catch(() => undefined);
        await refresh().catch(() => undefined);
        setBusy(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Nothing was deleted.");
      setBusy(null);
    }
  }

  return (
    <main className="sq-auth">
      <div className="sq-ambient" aria-hidden="true" />

      <div className="sq-auth-card sq-doc">
        <header className="sq-auth-head">
          <Logo size={44} />
          <h1>Privacy</h1>
          <p>What Study Quest stores, what leaves this machine, and how to delete it.</p>
        </header>

        <h2>What is stored</h2>
        <p className="sq-doc-lead">
          Everything the app knows about you lives in one PostgreSQL database, plus a few folders in
          the project directory:
        </p>
        <ul>
          <li>
            <b>Study content</b> — subjects and topics, notes with their revision history, tasks and
            plans, quizzes with every attempt, flashcard decks and cards, study sessions, quests, XP
            and your streak.
          </li>
          <li>
            <b>Account</b> — your email and a password hash, in the same database. The password
            itself is never stored.
          </li>
          <li>
            <b>Attachments</b> — uploaded files on disk under <code>data/files/</code> (or your own
            R2 bucket if you configured one), with their metadata in the database.
          </li>
          <li>
            <b>Backups</b> — a daily zip in <code>data/backups/</code>, kept for fourteen days. It
            contains the whole database, so delete it when you delete the rest.
          </li>
          <li>
            <b>Settings and history</b> — reminder preferences, LAN-mode state, recent searches, and
            a local log file with any server errors.
          </li>
        </ul>
        <p>
          The database is the Docker PostgreSQL on this machine by default. If your{" "}
          <code>.env</code> points <code>DATABASE_URL</code> at a hosted instance such as Neon, your
          data lives there instead — the app itself and everything above stays the same.
        </p>

        <h2>What leaves this machine</h2>
        <p className="sq-doc-lead">Nothing, unless you ask for it.</p>
        <ul>
          <li>
            <b>AI features only.</b> Pressing Summarise, Explain, Generate quiz or Generate cards
            sends the selected note or topic to the provider you configured (Groq by default) and
            brings the answer back. Nothing is sent in the background.
          </li>
          <li>
            <b>Hosted database, if you chose one.</b> With <code>DATABASE_URL</code> pointing away
            from this machine, your data is stored where you put it.
          </li>
          <li>
            <b>LAN mode.</b> Other devices on your network reach this machine's server over HTTP
            with a PIN you set.
          </li>
        </ul>
        <p>
          There is no analytics, no telemetry, no crash reporting and no advertising. Fonts, scripts
          and icons are served by this app itself, so no third party sees which page you open.
          Operating-system notifications are delivered locally by your browser, and sessions ride in
          an httpOnly cookie that page scripts cannot read.
        </p>

        <h2>How to delete everything</h2>
        <p className="sq-doc-lead">
          Export first if you might want it back — Settings, then Data, then Export everything.
          Deletion is immediate and complete.
        </p>

        {signedIn ? (
          <div className="sq-doc-danger">
            <div className="sq-doc-actions">
              <button
                type="button"
                className="sq-btn sq-btn-secondary"
                disabled={busy !== null}
                onClick={() => void erase("data")}
              >
                {busy === "data" ? "Deleting…" : "Erase my data"}
              </button>
              <button
                type="button"
                className="sq-btn sq-btn-danger"
                disabled={busy !== null}
                onClick={() => void erase("account")}
              >
                {busy === "account" ? "Deleting…" : "Delete my account"}
              </button>
            </div>
            <p className="sq-help">
              <b>Erase my data</b> removes every subject, note, quiz, card, task, session and quest,
              keeps you signed in, and starts onboarding again. <b>Delete my account</b> does the
              same and also removes your email, password and sessions.
            </p>
            {error ? (
              <p className="sq-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="sq-help">
            Sign in to erase your data or delete your account.{" "}
            <Link to="/sign-in">Go to sign in</Link>
          </p>
        )}

        {done ? (
          <p className="sq-help" role="status">
            {done}
          </p>
        ) : null}

        <p className="sq-auth-note">
          On this machine, without the app: stop the server, delete the <code>data/</code> folder
          (files, backups and the local database), and drop the Docker database or your Neon branch.{" "}
          <Link to="/sign-in">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}

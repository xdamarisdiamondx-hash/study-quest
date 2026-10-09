import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useRegisterSW } from "virtual:pwa-register/react";

import { AppShell } from "./app/AppShell";
import { RedirectIfAuthed, RequireAuth } from "./app/guards";
import { RouteFallback } from "./app/RouteFallback";
import { LanGate } from "./features/settings/LanGate";
import { lanApi } from "./lib/lanApi";
import { requestBackgroundSync } from "./offline/install";

/* Route-level code splitting (P21): every page is its own chunk so the first
   paint ships the shell — React, router, auth, chrome — instead of all
   fifteen screens. The named exports are unwrapped here once, so routes keep
   reading like components. Guards, the shell and the gate stay static: they
   are what has to exist before any route can decide what to render. */
const SignInPage = lazy(() =>
  import("./features/auth/SignInPage").then((m) => ({ default: m.SignInPage })),
);
const PrivacyPage = lazy(() =>
  import("./features/privacy/PrivacyPage").then((m) => ({ default: m.PrivacyPage })),
);
const OnboardingPage = lazy(() =>
  import("./features/onboarding/OnboardingPage").then((m) => ({ default: m.OnboardingPage })),
);
const HomePage = lazy(() =>
  import("./features/home/HomePage").then((m) => ({ default: m.HomePage })),
);
const PlanPage = lazy(() =>
  import("./features/plan/PlanPage").then((m) => ({ default: m.PlanPage })),
);
const TasksPage = lazy(() =>
  import("./features/tasks/TasksPage").then((m) => ({ default: m.TasksPage })),
);
const StudyPage = lazy(() =>
  import("./features/study/StudyPage").then((m) => ({ default: m.StudyPage })),
);
const SubjectDetailPage = lazy(() =>
  import("./features/study/SubjectDetailPage").then((m) => ({ default: m.SubjectDetailPage })),
);
const NotesPage = lazy(() =>
  import("./features/study/NotesPage").then((m) => ({ default: m.NotesPage })),
);
const SessionsPage = lazy(() =>
  import("./features/sessions/SessionsPage").then((m) => ({ default: m.SessionsPage })),
);
const QuestsPage = lazy(() =>
  import("./features/quests/QuestsPage").then((m) => ({ default: m.QuestsPage })),
);
const ProgressPage = lazy(() =>
  import("./features/progress/ProgressPage").then((m) => ({ default: m.ProgressPage })),
);
const SearchPage = lazy(() =>
  import("./features/search/SearchPage").then((m) => ({ default: m.SearchPage })),
);
const SettingsPage = lazy(() =>
  import("./features/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);

type Gate = { phase: "checking" } | { phase: "open" } | { phase: "locked" };

export function App() {
  const [gate, setGate] = useState<Gate>({ phase: "checking" });

  // The worker registers at PAGE level, not in the shell: /sign-in, /privacy
  // and /onboarding render outside AppShell, and a first-time visitor has to
  // get the same installable, updatable, offline-capable app a signed-in one
  // does (PWA audit). The prompt-style update keeps the P20 contract — the
  // student decides when to reload — and the strips follow it up to this
  // level so no route can be left on a stale version with no way out.
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
    offlineReady: [ready, setReady],
  } = useRegisterSW({
    onRegistered: () => requestBackgroundSync(),
  });

  // Reads where the gate stands WITHOUT touching state, so every trigger (boot,
  // a mid-session 423, a successful unlock) can share one path while setState
  // stays inside async callbacks — never in an effect body (lint, ADR-021).
  const readGate = useCallback(async (): Promise<Gate> => {
    try {
      const status = await lanApi.status();
      return status.enabled && !status.unlocked ? { phase: "locked" } : { phase: "open" };
    } catch {
      // No answer from the API: render the app and let each surface show its own
      // state — the gate must never be what blocks a local session whose server
      // is merely restarting.
      return { phase: "open" };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const apply = () => {
      void readGate().then((next) => {
        if (!cancelled) setGate(next);
      });
    };

    apply();
    // A mid-session 423 (LAN mode switched on from another window) re-locks here.
    window.addEventListener("sq:lan-locked", apply);
    return () => {
      cancelled = true;
      window.removeEventListener("sq:lan-locked", apply);
    };
  }, [readGate]);

  if (gate.phase === "checking") {
    return (
      <div className="sq-boot" role="status">
        Study Quest
      </div>
    );
  }
  if (gate.phase === "locked") return <LanGate onUnlocked={() => void readGate().then(setGate)} />;

  return (
    <>
      {needRefresh ? (
        <div className="sq-strip sq-strip-update" role="status">
          <span>A new version of Study Quest is ready.</span>
          <button
            type="button"
            className="sq-btn sq-btn-primary sq-btn-sm"
            onClick={() => void updateServiceWorker(true)}
          >
            Reload
          </button>
        </div>
      ) : null}
      {ready ? (
        <div className="sq-strip sq-strip-ready" role="status">
          <span>Ready to work offline — your last-viewed pages are saved on this device.</span>
          <button
            type="button"
            className="sq-btn sq-btn-secondary sq-btn-sm"
            onClick={() => setReady(false)}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route
            path="/sign-in"
            element={
              <RedirectIfAuthed>
                <SignInPage />
              </RedirectIfAuthed>
            }
          />
          {/* Public on purpose: readable before an account exists (P22). */}
          <Route path="/privacy" element={<PrivacyPage />} />

          {/* Everything below requires a session (P3). */}
          <Route element={<RequireAuth />}>
            <Route path="onboarding" element={<OnboardingPage />} />

            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="plan" element={<PlanPage />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="study" element={<StudyPage />} />
              <Route path="study/:subjectId" element={<SubjectDetailPage />} />
              <Route path="study/:subjectId/notes" element={<NotesPage />} />
              <Route path="study/:subjectId/:topicId/notes" element={<NotesPage />} />
              <Route path="sessions" element={<SessionsPage />} />
              <Route path="quests" element={<QuestsPage />} />
              <Route path="progress" element={<ProgressPage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

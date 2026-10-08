import { useCallback, useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import { AppShell } from "./app/AppShell";
import { RedirectIfAuthed, RequireAuth } from "./app/guards";
import { SignInPage } from "./features/auth/SignInPage";
import { OnboardingPage } from "./features/onboarding/OnboardingPage";
import { HomePage } from "./features/home/HomePage";
import { PlanPage } from "./features/plan/PlanPage";
import { TasksPage } from "./features/tasks/TasksPage";
import { StudyPage } from "./features/study/StudyPage";
import { SubjectDetailPage } from "./features/study/SubjectDetailPage";
import { NotesPage } from "./features/study/NotesPage";
import { SessionsPage } from "./features/sessions/SessionsPage";
import { QuestsPage } from "./features/quests/QuestsPage";
import { ProgressPage } from "./features/progress/ProgressPage";
import { SearchPage } from "./features/search/SearchPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { LanGate } from "./features/settings/LanGate";
import { lanApi } from "./lib/lanApi";

type Gate = { phase: "checking" } | { phase: "open" } | { phase: "locked" };

export function App() {
  const [gate, setGate] = useState<Gate>({ phase: "checking" });

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
    <Routes>
      <Route
        path="/sign-in"
        element={
          <RedirectIfAuthed>
            <SignInPage />
          </RedirectIfAuthed>
        }
      />

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
  );
}

import { Routes, Route, Navigate } from "react-router-dom";

import { AppShell } from "./app/AppShell";
import { RedirectIfAuthed, RequireAuth } from "./app/guards";
import { SignInPage } from "./features/auth/SignInPage";
import { OnboardingPage } from "./features/onboarding/OnboardingPage";
import { HomePage } from "./features/home/HomePage";
import { TasksPage } from "./features/tasks/TasksPage";
import { StudyPage } from "./features/study/StudyPage";
import { SubjectDetailPage } from "./features/study/SubjectDetailPage";
import { NotesPage } from "./features/study/NotesPage";
import { QuestsPage } from "./features/quests/QuestsPage";
import { ProgressPage } from "./features/progress/ProgressPage";

export function App() {
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
          <Route path="tasks" element={<TasksPage />} />
          <Route path="study" element={<StudyPage />} />
          <Route path="study/:subjectId" element={<SubjectDetailPage />} />
          <Route path="study/:subjectId/notes" element={<NotesPage />} />
          <Route path="study/:subjectId/:topicId/notes" element={<NotesPage />} />
          <Route path="quests" element={<QuestsPage />} />
          <Route path="progress" element={<ProgressPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

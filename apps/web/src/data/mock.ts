/**
 * Placeholder data for the shell.
 *
 * Subjects, topics and subject progress are real as of P4 — those come from
 * `lib/useSubjects` and are not mocked here any more. What remains below is everything
 * whose phase has not landed: tasks (P11), quests (P13), XP and streaks (P15), and
 * notes (P5).
 *
 * Each export is removed the moment its phase ships, so a stale mock cannot masquerade
 * as a feature that works.
 */
import { levelProgress, levelTitle, XP } from "@sq/core/gamification";

export const TOTAL_XP = 1_240;

export const profile = {
  displayName: "Praise",
  totalXp: TOTAL_XP,
  streakDays: 7,
};

export const level = {
  ...levelProgress(profile.totalXp),
  title: levelTitle(levelProgress(profile.totalXp).level),
  next: XP.quizAttempt * 5,
};

export interface TodayItem {
  id: string;
  title: string;
  subject: string;
  minutes: number;
  done: boolean;
}

export const todayQuest: TodayItem[] = [
  { id: "q1", title: "Review Atomic Structure", subject: "Chemistry", minutes: 25, done: true },
  { id: "q2", title: "Complete quiz", subject: "Chemistry", minutes: 10, done: true },
  { id: "q3", title: "Complete assignment", subject: "Mathematics", minutes: 30, done: false },
  { id: "q4", title: "Review Motion", subject: "Physics", minutes: 20, done: false },
];

export const recommendation = {
  text: "You scored 5/10 on Motion. Try a quick review?",
  cta: "Start review",
};

export interface TaskSummary {
  id: string;
  title: string;
  subject: string;
  due: string;
  priority: "high" | "normal" | "low";
  done: boolean;
  recurring?: string;
}

export const tasks: TaskSummary[] = [
  { id: "t1", title: "Complete Physics assignment", subject: "Physics", due: "Friday", priority: "high", done: false },
  { id: "t2", title: "Review Chemistry", subject: "Chemistry", due: "Sunday", priority: "normal", done: false, recurring: "Every Sunday" },
  { id: "t3", title: "Study Mathematics", subject: "Mathematics", due: "Today", priority: "normal", done: true, recurring: "Mon, Wed, Fri" },
  { id: "t4", title: "Read Biology revision notes", subject: "Biology", due: "Tuesday", priority: "low", done: false },
];

export const activeQuest = {
  id: "q-photo",
  title: "Master Photosynthesis",
  progress: "3/5",
  steps: [
    { id: "s1", title: "Read notes", state: "done" as const },
    { id: "s2", title: "Review summary", state: "done" as const },
    { id: "s3", title: "Study flashcards", state: "done" as const },
    { id: "s4", title: "Complete quiz", state: "current" as const },
    { id: "s5", title: "Pass final challenge", state: "locked" as const },
  ],
};

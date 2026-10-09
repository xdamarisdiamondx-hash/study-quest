# Changelog

All notable changes to Study Quest. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-09

First release: the whole Plan → Study → Understand → Practice → Quiz → Review loop, built
across phases P0–P22 and released for the daily-use beta.

### Added

- **Planning** — tasks with deadlines, priorities and recurrence, a daily plan materialised
  from them, and a Today's Quest that always answers "what now?".
- **Study** — subjects and topics, notes with revision history, AI summaries and
  explanations (Ollama locally or any cloud key), Read My Notes with highlighting, quizzes
  (multiple choice, true/false, short answer) with retry quizzes built from what you got
  wrong, and flashcards with spaced review.
- **Motivation** — XP, a 50-level curve, streaks with freezes, achievements, quests with
  steps, and ranked recommendations that never flood the screen.
- **Search** — typo-tolerant search across everything from `Ctrl`/`⌘ + K`, with filters and
  recent queries.
- **Installable and offline** — a PWA that installs on desktop or phone; opened pages keep
  working with no network, edits queue on the device and sync in order when you are back.
- **Accounts and privacy** — local email/password accounts (Better Auth, httpOnly session
  cookies), full export to a zip, daily backups kept fourteen days, and a **`/privacy`**
  page that states what is stored, what leaves the machine, and erases it all on request —
  keeping your display name and account so you can start over.
- **First run** — five-step onboarding ending in starter subjects, one of them (Physics)
  with a worked example note, quiz and deck waiting.
- **Running it** — one process serves the built app and the API (`scripts\start.ps1`), and
  `scripts\install-autostart.ps1` brings the server up at Windows logon with a transcript in
  `data\autostart.log`.
- **Quality** — light and dark themes, keyboard and screen-reader accessibility (zero axe
  violations), designed empty/loading/error states everywhere, Zod contracts on the API
  boundary, Storybook, and a bundle budget enforced by `pnpm budget`.

### Notes

- The database is PostgreSQL 17 wherever you put it: the Docker container, a hosted
  instance such as Neon, or the built-in PGlite when no `DATABASE_URL` is set.
- The two-week daily-use beta starts with this tag. Friction found during it is logged and
  fixed as it appears.

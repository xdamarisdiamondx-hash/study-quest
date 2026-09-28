# Study Quest — Implementation Plan

Version 1.0 · 23 phases in 6 milestones · Source: [PRD](PRD.md) · Architecture:
[ARCHITECTURE.md](ARCHITECTURE.md) · Design system: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)

---

## 1. How to use this plan

- Phases are ordered by dependency, not by appeal. Do not skip ahead.
- Every phase has **exit criteria** — a checklist that must be fully ticked before the next
  phase starts. That is the only definition of "done".
- The MVP is **Milestones 0–4 (P0–P19)**. Milestone 5 hardens and ships. Anything after P22 is
  the post-MVP backlog (§8).
- Effort figures are **developer-days** for one person working full time, including tests and
  docs. They are estimates for planning, not commitments.

### Definition of done (applies to every phase)

1. Feature works in light **and** dark theme, mobile **and** desktop widths.
2. Keyboard operable, visible focus, AA contrast, screen-reader labels on progress components.
3. Loading, empty, error and offline states designed and implemented — not placeholders.
4. Unit tests for logic; one Playwright journey if the phase has a user-facing flow.
5. Zod contract for anything crossing the API boundary; no `any` in new code.
6. Storybook story for every new component.
7. Commits are small, conventional, and the branch is pushed.

---

## 2. Milestone map

| Milestone | Phases | Theme | Outcome | Effort |
| --- | --- | --- | --- | --- |
| **M0 Foundation** | P0–P3 | Tooling, design system, data, shell | App runs locally, looks like Study Quest, has an account | 12 d |
| **M1 Learn** | P4–P6 | Subjects, notes, AI platform | Can organise subjects and write notes; AI works | 12 d |
| **M2 Understand & Practice** | P7–P10 | Summaries, quizzes, flashcards, reading | The full Plan→Review loop works | 18 d |
| **M3 Organise** | P11–P14 | Tasks, planning, quests, sessions | Study Quest guides the day | 15 d |
| **M4 Motivate** | P15–P19 | XP, progress, recommendations, reminders, search | Progress visible, "what's next?" always answered | 15 d |
| **M5 Ship** | P20–P22 | PWA, quality bar, release | Installable, accessible, backed up, running daily | 10 d |
| | | | **Total** | **≈ 82 d** |

Realistic elapsed time for one person studying part-time: **5–7 months**. Full time: 4 months.

---

# Milestone 0 — Foundation

## P0 · Repository and toolchain
**Goal:** a clean machine can clone, install and run the app with one command.

- [ ] Install and pin Node 22 LTS, pnpm, Git, GitHub CLI
- [ ] Initialise pnpm workspaces: `apps/web`, `apps/server`, `packages/core`, `packages/db`,
      `packages/ui`
- [ ] TypeScript strict config shared across packages; path aliases (`@sq/core`,
      `@sq/db`, `@sq/ui`, `@sq/schemas`)
- [ ] ESLint + Prettier; rule banning raw hex colours and `any` (DESIGN_SYSTEM §13)
- [ ] Editor config, `.editorconfig`, pre-commit hook (lint + format + typecheck)
- [ ] `scripts/setup.ps1` — checks prerequisites, installs, initialises DB, generates icons
- [ ] `scripts/dev.ps1` — runs server + web with hot reload, one command
- [ ] `scripts/start.ps1` — production build served by the server on `:4321`
- [ ] `.env.example` and `config.local.json.example`
- [ ] CI: GitHub Actions — install, typecheck, lint, test on every push (free for public repos)

**Exit:** `.\scripts\setup.ps1` then `.\scripts\dev.ps1` gives a running app with a health
endpoint and a green CI badge.
**Effort:** 2 d · **Depends on:** none

## P1 · Design system and brand
**Goal:** every later screen is assembled from this, and it looks like one product.

- [ ] **Logo** — finalise `brand/` assets (done: mark, lockup, mono, favicon), generate
      `icon-192/512`, `maskable-512`, `apple-touch-icon`, `favicon.ico` via
      `scripts/generate-icons.mjs`
- [ ] Token file `tokens.css`: colour ramps, semantic aliases, spacing, radius, elevation,
      typography scale, motion durations, dark-mode overrides
- [ ] Wire tokens into Tailwind v4 `@theme`; verify the lint rule catches raw hex
- [ ] Self-host Inter variable font, preload, `font-display: swap`
- [ ] Base components: Button, IconButton, Input, Textarea, Select, Checkbox, Toggle, Radio,
      SegmentedControl, Slider, Chip, Card, Badge, Avatar, Divider, Skeleton, EmptyState,
      Tooltip, Popover, Modal, BottomSheet, Toast (with live region)
- [ ] Data components: ProgressBar, ProgressRing, XpBar, LevelBadge, StreakFlame, StatTile
- [ ] Domain components (first pass): SubjectCard, SubjectAvatar, TopicRow, NoteCard, TaskRow
- [ ] Storybook configured with both themes and the token reference page
- [ ] Dark mode switch wired end to end (system / light / dark)
- [ ] Keyboard focus system and reduced-motion handling verified across the set

**Exit:** Storybook shows every component in 2 themes × 8 states, with an a11y check per
story; a real screen built only from these looks finished.
**Effort:** 5 d · **Depends on:** P0

## P2 · Data foundation
**Goal:** the domain is modelled, migrated and seedable; the server speaks Zod.

- [ ] Drizzle schema for all tables in ARCHITECTURE §5 (auth, structure, notes, AI artifacts,
      practice, tasks, planning, quests, gamification, platform)
- [ ] Migration scripts + `drizzle-kit` config; `migrate.ps1`
- [ ] Seed data: 8 example subjects with topics, a realistic note, a sample quiz, achievement
      definitions, 50 levels
- [ ] FTS5 `search_index` table with triggers for all searchable entities
- [ ] Repository layer `packages/db/repositories/*` — the only place SQL is written
- [ ] Hono server: `/api/health`, request logging, Zod validation middleware, error envelope,
      auth middleware (session cookie)
- [ ] Backup endpoint + `scripts/backup.ps1` (ADR-022)
- [ ] Tests: repository smoke tests against an in-memory SQLite file

**Exit:** `migrate` + `seed` + `backup` + `restore` all work from the command line; API
returns a typed error for a bad request.
**Effort:** 3 d · **Depends on:** P0, P1 (for types)

## P3 · Auth, onboarding and app shell
**Goal:** the app opens, you sign in, and you can move between the five sections.

- [ ] Register / login / logout screens, scrypt hashing, session cookie, route protection
- [ ] Onboarding: welcome, display name, first subject, "how Study Quest works" carousel
      (Plan → Study → … → Progress), reminder permission prompt
- [ ] App shell: bottom tabs (mobile) / left rail (desktop), header, command palette shell
- [ ] Route map for all five sections with lazy loading and 404 / error boundaries
- [ ] Settings: theme, display name, LAN access toggle with PIN, backup, data export
- [ ] PWA manifest + install prompt (full offline work in P20)
- [ ] Empty states for every section ("No subjects yet — add your first")

**Exit:** a new user can register, add a subject, and land on an empty but polished Home.
**Effort:** 2 d · **Depends on:** P2

---

# Milestone 1 — Learn

## P4 · Subjects and topics
**Goal:** the structure everything else hangs from.

- [ ] Subject CRUD: name, colour (8-palette picker), icon, order, archive
- [ ] Reorder subjects and topics by drag or keyboard
- [ ] Topic CRUD within a subject, with status (not started / learning / mastered)
- [ ] Import template: pick a subject set (e.g. Biology, Chemistry, Mathematics) with sensible
      starter topics
- [ ] Subject detail page with tabs: Overview / Topics / Notes / Quizzes / Flashcards / Tasks
- [ ] Progress placeholders wired to the real calculation (P16) so the UI never changes later
- [ ] Global subject/topic picker component (used by tasks, notes, sessions)

**Exit:** create, edit, reorder, archive and delete subjects and topics; all changes persist
and appear everywhere the subject is referenced.
**Effort:** 2 d · **Depends on:** P3

## P5 · Notes
**Goal:** capture material in a form the rest of the app can use.

- [ ] Note editor: markdown + shortcuts, autosave with debounce, "saved" indicator, word count
- [ ] Paste-from-clipboard cleanup (strip formatting, detect headings)
- [ ] Title auto-generated from the first line if left blank
- [ ] `sub`/`sup` helpers for scientific notation, and a light formula affordance
- [ ] Note detail: rendered reading view, edit toggle, pin, duplicate, export (`.md`)
- [ ] Versions: last 20 revisions with restore (ADR/ZIP: `note_revisions`)
- [ ] Import plain text → note
- [ ] Note action bar (disabled with a hint until P6): Summarise, Explain, Generate quiz,
      Generate flashcards, Read aloud, Start study session

**Exit:** create, edit, pin, version-restore and export a note; it renders correctly with
chemical/scientific notation.
**Effort:** 3 d · **Depends on:** P4

## P6 · AI platform
**Goal:** one provider layer that every AI feature then rides on. No feature code may know
which model it called.

- [ ] `AiProvider` interface + adapters: `ollama`, `gemini`, `groq`, `openaiCompat`, `mock`
- [ ] Provider registry with fallback chain and `health()` probing (ADR-007)
- [ ] Prompt registry structure with versioning, schemas, model tiers
- [ ] `ai_artifacts` cache keyed by `input_hash` (ADR-008) with hit/miss logging
- [ ] Structured-output validation with Zod + one repair retry (ADR-009)
- [ ] Token/cost recording and daily call cap (ADR-025)
- [ ] Settings UI: provider picker, model field, API key (write-only), "Test connection",
      monthly estimate, "no provider configured" guided setup
- [ ] Streaming endpoint (SSE) for long text, with a stop button
- [ ] Offline mode: every AI action shows cached result or a clear setup prompt
- [ ] Tests: mock provider golden files for every prompt; contract test suite for all adapters

**Exit:** `summary.v1` works through Ollama and through a cloud provider without changing
feature code; switching providers changes no UI.
**Effort:** 5 d · **Depends on:** P5

---

# Milestone 2 — Understand and practice

## P7 · Summaries and Explain
**Goal:** turn a wall of notes into something a student can actually learn from.

- [ ] Summary composer: length (quick/standard/detailed) × format (paragraph/bullets/key
      points/exam-style), with a preview of the chosen combination
- [ ] Summary panel: rendered result, word count vs original, "regenerate", "save to note",
      "copy", print
- [ ] Grounding guardrail visible in the UI: content drawn from the notes vs extra explanation
      are visually distinguished
- [ ] Explain: select text in a note (or ask from a topic) → style picker (simple,
      step-by-step, example, real-life, beginner) → streamed explanation
- [ ] "Explain again / try a different way" loop with the previous attempt kept visible
- [ ] Save explanation as a note or attach it to the topic as a study aid

**Exit:** from any note, one tap produces a grounded summary and a re-askable explanation; both
are cached and regenerable.
**Effort:** 3 d · **Depends on:** P6

## P8 · Quiz generation, taking and retry
**Goal:** the practice loop, including the retry that makes it a loop.

- [ ] Quiz composer: source note or topic, 5/10/15/20 questions, types (MCQ / true-false /
      short answer), difficulty (easy→hard or slider)
- [ ] Generation with progress feedback; validation failures retried once, then surfaced
- [ ] Quiz runner (theatre mode): one question per screen, keyboard shortcuts, progress bar,
      flag-for-review, pause/exit with state preserved
- [ ] Grading: MCQ, true/false, short answer with keyword matching and "self-mark correct"
- [ ] Results screen: score donut, per-question review with explanations, time spent,
      **weak topics list** (PRD §12)
- [ ] Retry quiz: from wrong answers → group by concept tag → 5-question focused retry
      (ADR §5.2), with its own results and an improvement comparison
- [ ] `question_mastery` updates on every answer, feeding progress and recommendations
- [ ] Quiz history per topic with trend sparkline

**Exit:** generate → take → results → weak topics → retry → measurably better. The full
cycle of PRD §13 works end to end.
**Effort:** 6 d · **Depends on:** P6, P7 (needs mastery tagging)

## P9 · Flashcards with spaced repetition
**Goal:** cheap, repeated review that feeds the same mastery data as quizzes.

- [ ] Deck generation from a note or topic; editable cards before saving
- [ ] Study mode: flip animation, Know / Review / Hard / Easy, keyboard and swipe
- [ ] SM-2 scheduling (`ease`, `interval_days`, `repetitions`, `lapses`, `due_at`)
- [ ] Due counts on Home and in the deck list; "review 20 now" quick action
- [ ] Mastery view: cards by due date, hard cards, and per-topic coverage
- [ ] Manual card CRUD, import/export as TSV or Anki-compatible text
- [ ] XP awarded per reviewed batch (ADR §5.2)

**Exit:** generate a deck, study it, and see due counts and coverage update tomorrow.
**Effort:** 4 d · **Depends on:** P6, P8 (mastery data)

## P10 · Read My Notes
**Goal:** listening that is interactive rather than passive.

- [ ] Reading mode: clean typography, comfortable measure, chapter scroll, progress
- [ ] TTS via Web Speech API with voice/rate/pitch settings (DESIGN_SYSTEM §8 theatre template)
- [ ] Follow-along: highlight the current sentence using boundary events, with a fallback to
      sentence timing where boundaries are unavailable
- [ ] Playback controls: play/pause, skip sentence, ±10 s, speed, keyboard shortcuts
- [ ] Pause and ask "Explain this" — the current sentence is sent with context to `explain.v1`
      and the answer appears inline under the highlighted text
- [ ] TTS fallback: if the platform has no voice for the language, degrade to a
      read-along-with-highlight experience and say so

**Exit:** notes can be read aloud with sentence-level highlighting, and a confusing sentence can
be explained without leaving the screen.
**Effort:** 3 d · **Depends on:** P5, P7

---

# Milestone 3 — Organise

## P11 · Task manager
**Goal:** assignments and revision, with repetition.

- [ ] Task composer: title, kind (homework/assignment/revision/project/personal/goal),
      subject, topic, deadline, priority, estimate, notes
- [ ] Views: Today, Upcoming, All, Done; filter by subject/priority/kind; sort by deadline,
      priority, estimate
- [ ] Complete / uncomplete with undo, XP award, and effect on quests and streak
- [ ] Overdue handling: no red shaming, offer reschedule or "move to today"
- [ ] Recurring tasks: rrule-lite editor (daily, weekly by weekday, interval, until date) and
      occurrence materialisation 14 days ahead (ADR-017)

**Exit:** create, complete, repeat and reschedule tasks; recurring tasks appear on the right
days and can be skipped without deleting the series.
**Effort:** 4 d · **Depends on:** P4

## P12 · Connected tasks and study planning
**Goal:** tasks stop being a separate feature (PRD §17–19).

- [ ] Task suggestions: "review Motion for 20 min, then a short quiz" generated from the task's
      topic, its mastery, and the deadline
- [ ] Accept / dismiss / edit suggestions; accepted ones become plan blocks
- [ ] Three planning modes: **manual** (student builds the day), **suggested**, **automatic**
      (deadlines, tests, unfinished tasks, goals, available minutes)
- [ ] Day view: timeline of blocks, capacity indicator, drag to reorder
- [ ] **Today's Quest**: personalised list generated daily, ≤ 6 items, grouped by subject,
      with progress (PRD §19)
- [ ] Regenerate the daily quest with "keep what you've done"
- [ ] Everything editable — the student is always in control (principle 4)

**Exit:** a student with five deadlines gets a sensible day plan they can edit, and today's
quest reflects real progress as items are completed.
**Effort:** 5 d · **Depends on:** P11, P8 (mastery informs suggestions)

## P13 · Quest system
**Goal:** quests as meaningful study goals, not renamed tasks (PRD §20–21).

- [ ] Quest templates: Topic, Subject, Exam, Weekly, Personal (PRD §21)
- [ ] Quest builder: title, scope, steps, reward, due date; steps reference real activities
      (read notes, review summary, study flashcards, complete quiz, pass final challenge)
- [ ] Step execution deep-links into the actual feature and auto-completes on success
- [ ] Quest progress, locked/unlocked step states, completion celebration + XP
- [ ] Active and completed quest views; "special quests" offered occasionally, never spammed
- [ ] Quest templates in the seed data so the first-run experience has one waiting

**Exit:** complete a subject quest end to end — every step launches real work, progress is
tracked, and the reward lands in the XP ledger.
**Effort:** 3 d · **Depends on:** P12, P9

## P14 · Study sessions
**Goal:** three ways to sit down and study (PRD §26).

- [ ] Session modes: Quick Focus (just work), Focus Session (timer, optional pomodoro breaks),
      Guided Study (Read → Understand → Practice → Quiz → Review)
- [ ] Guided session assembles steps from the topic's actual content and runs them in order
- [ ] Timer: start/pause/stop, background-safe (uses timestamps, not tick counting), persists
      across a reload
- [ ] Session log: subject, topic, task, mode, planned vs actual minutes
- [ ] Session summary on completion with XP, streak status, and the next suggested action

**Exit:** a 25-minute focus session and a full guided session both complete, log time, award
XP and update subject progress.
**Effort:** 3 d · **Depends on:** P10, P12, P13

---

# Milestone 4 — Motivate

## P15 · Gamification
**Goal:** rewards that encourage learning, not app opening (principle 1).

- [ ] XP ledger with idempotent awards and all reasons from ARCHITECTURE §5.2
- [ ] Levels: curve, titles, progress bar to next level, level-up celebration
- [ ] Streaks: current/longest, freeze mechanics, streak calendar, gentle recovery messaging
- [ ] Achievements: First Quest, Quiz Master, Consistent Learner, Subject Explorer, Comeback,
      plus 5 more; progress tracked before unlock, claim flow
- [ ] Reward feedback: XP toast with reason, badge unlock card, quest-complete moment —
      all under 600 ms, all disabled in reduced-motion
- [ ] Anti-pattern check: no XP for opening the app, no daily-login-only rewards

**Exit:** every XP event in the ledger is traceable to a source row and cannot be double counted.
**Effort:** 4 d · **Depends on:** P2 (ledger), P12–P14 (sources)

## P16 · Progress tracking
**Goal:** make progress easy to understand visually (PRD §24–25).

- [ ] Home progress strip: level, XP to next, streak, today's progress ring
- [ ] Progress engine in `packages/core/progress`: mastery, review coverage, session coverage,
      quest completion (ARCHITECTURE §5.2)
- [ ] Subject progress pages: overall %, per-topic bars, trend over 30/90 days
- [ ] Study time: today, this week, per subject, heatmap calendar
- [ ] Quiz history: scores over time, improvement per topic, retry impact
- [ ] Charts: line, bar, ring, heatmap — theme-aware, accessible (table equivalent available)
- [ ] Caching and recompute strategy per ADR-016

**Exit:** every number shown on screen can be explained by a documented formula and traced to
the events behind it.
**Effort:** 4 d · **Depends on:** P8, P9, P14, P15

## P17 · Recommendations and "what's next?"
**Goal:** always answer what's next, helpfully (PRD §27, principle 5).

- [ ] Rule engine in `packages/core/planning`: score overdue, weak mastery, due-soon,
      inactivity, streak protection; return max 3
- [ ] Home recommendations section, dismissible, with reason text ("you scored 5/10 last time")
- [ ] "Next up" strip after every completed activity: next quiz, review weak topics, next quest
      step, daily quest remainder
- [ ] Deep links from every recommendation into the right screen with context prefilled
- [ ] Anti-spam: max 3 shown, min 30 min between refreshes, never on a first-run empty account

**Exit:** after any completion, the user is shown exactly what to do next and can act in one tap.
**Effort:** 2 d · **Depends on:** P16, P12

## P18 · Notifications and reminders
**Goal:** useful nudges, fully under the student's control (PRD §28).

- [ ] Local scheduler in the server process; catch-up window on start (ADR-017)
- [ ] Reminder types: deadlines (T-1 day, T-1 hour), planned sessions, quest milestones, revision
      due (flashcards), streak at risk, unfinished tasks
- [ ] Delivery: in-app notification centre + Web Notifications API when permitted
- [ ] Quiet hours, per-type toggles, snooze, weekly digest option
- [ ] Reminder list UI with next-fire times

**Exit:** a reminder configured for tomorrow appears in the notification centre and the OS
notification at the right time, and can be snoozed or switched off per type.
**Effort:** 3 d · **Depends on:** P11, P13, P19 (search not needed; depends on quests/tasks)

## P19 · Global search
**Goal:** find anything, fast (PRD §29).

- [ ] FTS5 index populated by triggers; prefix matching so "Newt" finds "Newton"
- [ ] Search palette (⌘K / Ctrl+K) and a search screen
- [ ] Results grouped by entity with subject/topic context and jump-to-highlight
- [ ] Filters by type and subject; recent searches
- [ ] Empty and no-match states with suggestions

**Exit:** searching "Newton" returns the Motion notes, the Newton's Laws quiz, its flashcards
and the related revision task.
**Effort:** 2 d · **Depends on:** P2 (FTS5), P5, P8, P9, P11

---

# Milestone 5 — Ship

## P20 · PWA and offline
**Goal:** installable, and useful on a bad connection.

- [ ] `vite-plugin-pwa`: app shell precache, network-first data, cache-first assets
- [ ] Offline: last-viewed notes/topics/tasks readable; writes queued in IndexedDB and replayed
- [ ] Install prompt with custom UI; standalone display, icons, splash, theme colour
- [ ] Update-available prompt; versioned cache cleanup
- [ ] LAN access mode: bind `0.0.0.0`, PIN gate, instructions for installing on a phone
- [ ] Background sync for queued writes where supported

**Exit:** installed to a phone home screen, opened with Wi-Fi off, shows the last content and
queues an edit that syncs when the network returns.
**Effort:** 3 d · **Depends on:** P3, P19

## P21 · Quality bar
**Goal:** the app is trustworthy.

- [ ] Accessibility audit: axe on every screen, keyboard-only pass, screen-reader pass on the
      five key flows, contrast verification in both themes
- [ ] Performance: bundle budget enforced in CI, route splitting, image/font budgets, a real
      Lighthouse pass on a throttled profile
- [ ] Security review: cookie flags, rate limits on auth and AI routes, input validation audit,
      LAN PIN, key handling, no secrets in the repo
- [ ] Data portability: full export (`.zip` of DB + attachments + config template) and restore
- [ ] Backup automation: scheduled Windows task + a Settings nudge when the last backup is old
- [ ] Error reporting: local log file with a "copy diagnostics" action, no external reporting
- [ ] i18n scaffolding: strings extracted, date/number formatting centralised (first locale: en)
- [ ] Empty/error/loading state sweep — no placeholder text left anywhere

**Exit:** no axe violations, budgets enforced in CI, export/import round-trips cleanly.
**Effort:** 4 d · **Depends on:** all previous

## P22 · Release and daily use
**Goal:** it is running every day.

- [ ] First-run content: onboarding quests, a demo subject with real material
- [ ] `install-autostart.ps1` so the server starts at Windows logon
- [ ] Documentation: README quickstart, `docs/USER_GUIDE.md`, troubleshooting page
- [ ] Version tagging, release notes, `CHANGELOG.md`
- [ ] Beta run: use it for two real weeks, log friction, fix what blocks daily use
- [ ] Privacy page in the app: what is stored, what leaves the machine, how to delete everything

**Exit:** the app has been used daily for two weeks, backed up, and reinstalled from scratch
on a clean machine using only the README.
**Effort:** 3 d · **Depends on:** P21

---

## 3. Cross-cutting work

| Concern | When | Notes |
| --- | --- | --- |
| Testing | Every phase | `packages/core` unit tests; Playwright journeys added at P5, P8, P12, P14, P20 |
| Fixtures and seed data | P2, refreshed each phase | Realistic study material beats lorem ipsum for catching layout bugs |
| Copy and microcopy | Every phase | DESIGN_SYSTEM §11; no placeholder strings |
| Design review | P1, then every milestone | Milestone demos are design reviews |
| Performance budget | P1, enforced P21 | < 200 KB gzipped initial JS |
| Privacy review | P6, P21 | Every network call accounted for |
| Docs | Continuous | README quickstart, USER_GUIDE, CHANGELOG |

---

## 4. PRD traceability

| PRD section | Phase |
| --- | --- |
| §1–4 Overview, vision, users, core experience | P3 (shell), P14 (guided study) |
| §5 Home dashboard | P3 (shell), P16, P17 |
| §6 Subjects and topics | P4 |
| §7 Notes | P5 |
| §8 AI summary | P7 |
| §9 Explain | P7 |
| §10 Read My Notes | P10 |
| §11 Quiz generator | P8 |
| §12 Quiz results | P8 |
| §13 Smart retry quizzes | P8 |
| §14 Flashcards | P9 |
| §15 Task manager | P11 |
| §16 Recurring tasks | P11 |
| §17 Connected tasks | P12 |
| §18 Study planning | P12 |
| §19 Daily Study Quest | P12 |
| §20 Quest system | P13 |
| §21 Special quests | P13 |
| §22 Gamification | P15 |
| §23 Achievements | P15 |
| §24 Progress tracking | P16 |
| §25 Subject progress | P16 |
| §26 Study sessions | P14 |
| §27 Recommendations | P17 |
| §28 Notifications | P18 |
| §29 Search | P19 |
| §30 User journey | End-to-end demo at P22 |
| §31 Main sections | P3 |
| §32 MVP scope | P0–P19 |
| §33 Product principles | DESIGN_SYSTEM §1, enforced in DoD |
| §34 Core idea | P12 + P14 + P17 together |

**Every MVP item in PRD §32 is covered by P0–P19.** Nothing from the "later features" list is
required for the MVP.

---

## 5. Effort summary

| Milestone | Days |
| --- | --- |
| M0 Foundation | 12 |
| M1 Learn | 12 |
| M2 Understand & Practice | 18 |
| M3 Organise | 15 |
| M4 Motivate | 15 |
| M5 Ship | 10 |
| **Total** | **82** |

Contingency for a first-time solo build of something this size: **+25 %** (≈ 100 days total).

---

## 6. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | Local model output quality varies | High | High | Structured output + validation, provider-agnostic layer, prompt tuned for small models (P6) |
| R2 | Scope: 23 phases is a lot | High | High | Milestone gates; MVP ends at P19; post-MVP strictly optional |
| R3 | PWA cache causes stale or confusing data | Medium | Medium | Network-first for data, explicit update prompt, offline indicator (P20) |
| R4 | Machine off means no reminders | Medium | Low | Catch-up window on start; reminders also evaluated lazily on read (P18) |
| R5 | Data loss (single machine, single file) | Medium | High | Automated backups, export/restore, retention of 14 (P2, P21) |
| R6 | Gamification distracts from learning | Medium | High | Gold reserved for rewards, no login rewards, principle 1 in the design review checklist |
| R7 | AI cost surprises if a key is configured | Low | Medium | Daily call cap, cache, monthly estimate, mock provider default (P6) |
| R8 | Design system drift as components multiply | Medium | Medium | Lint rules, Storybook DoD, milestone design reviews |
| R9 | Windows tooling friction on setup | Medium | Low | One-command scripts, documented prerequisites, clean-machine reinstall test (P22) |
| R10 | Motivation dips on a long solo build | High | Medium | Milestone demos every 2–3 weeks, ship the P0–P3 vertical slice early and use the app daily |

---

## 7. Post-MVP backlog (PRD §32 "later features")

Ordered by value once the MVP loop works:

1. **PDF and document import** — extract text, generate notes, summaries and quizzes
2. **Photo notes** — capture a whiteboard or worksheet, OCR, add to a topic
3. **Advanced achievements** — more milestones, topic-mastery badges, seasonal challenges
4. **More special quests** — timed exam simulations, group challenges
5. **Shared study groups and collaboration** — requires accounts and a server (ADR-026)
6. **Leaderboards and social** — highest risk, lowest value for a single user; deliberately last
7. **Deeper personalisation** — adaptive difficulty, per-subject pacing
8. **Native wrapper** — Capacitor shell for the store, same build (ADR-026)
9. **Cloud sync** — move SQLite to Postgres, add object storage for attachments

---

## 8. Start here

**Day 1–2**

1. Install Node 22 LTS and pnpm; clone the repo.
2. Run `.\scripts\setup.ps1` (Phase P0).
3. Create the workspace skeleton: `apps/web`, `apps/server`, `packages/core`, `packages/db`,
   `packages/ui`.
4. Get a Hello-World React app served by Hono through Vite proxy, plus `/api/health`.

**Day 3–5**

5. P1: token file, Button/Input/Card/ProgressRing, Storybook, dark mode.
6. Put the logo in the shell header — the app should be recognisably Study Quest by the end of
   the first week.

**End of week 1 target:** a running local app with the brand, a design system you like, and a
working database with seeded subjects. That vertical slice is the proof the whole plan rests on.

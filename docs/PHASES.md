# Study Quest — Phase Index

One line per phase, in the order they must be built. Full detail for each phase — checklist,
exit criteria, dependencies, effort — is in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) Part III.

**Phases are sequential.** Do not start one before the previous phase's exit criteria are met.
**The MVP is P0–P19.** Everything from P20 on is hardening and release.

| Milestone                    | Outcome                                                  | Phases        | Days     |
| ---------------------------- | -------------------------------------------------------- | ------------- | -------- |
| **M0 Foundation**            | App runs locally, looks like Study Quest, has an account | P0–P3         | 13       |
| **M1 Learn**                 | Can organise subjects and write notes; AI works          | P4–P6         | 12       |
| **M2 Understand & Practice** | The full Plan→Review loop works                          | P7–P10        | 18       |
| **M3 Organise**              | Study Quest guides the day                               | P11–P14       | 15       |
| **M4 Motivate**              | Progress visible, "what's next?" always answered         | P15–P19       | 15       |
| **M5 Ship**                  | Installable, accessible, backed up, running daily        | P20–P22       | 11       |
|                              |                                                          | **23 phases** | **≈ 83** |

---

## M0 — Foundation

| Phase  | What it delivers                                                   | Days | Detail                                                          |
| ------ | ------------------------------------------------------------------ | ---- | --------------------------------------------------------------- |
| **P0** | Repository and toolchain                                           | 3    | [§P0](IMPLEMENTATION_PLAN.md#p0--repository-and-toolchain)      |
| **P1** | Design system and brand — logo, tokens, base components, dark mode | 5    | [§P1](IMPLEMENTATION_PLAN.md#p1--design-system-and-brand)       |
| **P2** | Data foundation — Postgres schema, migrations, seed, R2 service    | 4    | [§P2](IMPLEMENTATION_PLAN.md#p2--data-foundation)               |
| **P3** | Better Auth, onboarding, app shell, five sections navigable        | 2    | [§P3](IMPLEMENTATION_PLAN.md#p3--auth-onboarding-and-app-shell) |

## M1 — Learn

| Phase  | What it delivers                                                     | Days | Detail                                                |
| ------ | -------------------------------------------------------------------- | ---- | ----------------------------------------------------- |
| **P4** | Subjects and topics — the structure everything hangs from            | 2    | [§P4](IMPLEMENTATION_PLAN.md#p4--subjects-and-topics) |
| **P5** | Notes — editor, autosave, versions, attachments, AI action bar       | 3    | [§P5](IMPLEMENTATION_PLAN.md#p5--notes)               |
| **P6** | AI platform — provider adapters, prompt registry, caching, cost caps | 5    | [§P6](IMPLEMENTATION_PLAN.md#p6--ai-platform)         |

## M2 — Understand and Practice

| Phase   | What it delivers                                             | Days | Detail                                                              |
| ------- | ------------------------------------------------------------ | ---- | ------------------------------------------------------------------- |
| **P7**  | Summaries and Explain — grounded output, re-askable          | 3    | [§P7](IMPLEMENTATION_PLAN.md#p7--summaries-and-explain)             |
| **P8**  | Quizzes — generate, take, results, weak topics, retry        | 6    | [§P8](IMPLEMENTATION_PLAN.md#p8--quiz-generation-taking-and-retry)  |
| **P9**  | Flashcards — generation, study mode, spaced repetition       | 4    | [§P9](IMPLEMENTATION_PLAN.md#p9--flashcards-with-spaced-repetition) |
| **P10** | Read My Notes — text-to-speech, follow-along, explain inline | 3    | [§P10](IMPLEMENTATION_PLAN.md#p10--read-my-notes)                   |

## M3 — Organise

| Phase   | What it delivers                                          | Days | Detail                                                                 |
| ------- | --------------------------------------------------------- | ---- | ---------------------------------------------------------------------- |
| **P11** | Task manager — CRUD, filters, priorities, recurring tasks | 4    | [§P11](IMPLEMENTATION_PLAN.md#p11--task-manager)                       |
| **P12** | Connected tasks, study planning, Daily Quest              | 5    | [§P12](IMPLEMENTATION_PLAN.md#p12--connected-tasks-and-study-planning) |
| **P13** | Quest system — topic, subject, exam, weekly, personal     | 3    | [§P13](IMPLEMENTATION_PLAN.md#p13--quest-system)                       |
| **P14** | Study sessions — quick focus, focus timer, guided study   | 3    | [§P14](IMPLEMENTATION_PLAN.md#p14--study-sessions)                     |

## M4 — Motivate

| Phase   | What it delivers                                        | Days | Detail                                                             |
| ------- | ------------------------------------------------------- | ---- | ------------------------------------------------------------------ |
| **P15** | Gamification — XP ledger, levels, streaks, achievements | 4    | [§P15](IMPLEMENTATION_PLAN.md#p15--gamification)                   |
| **P16** | Progress tracking — dashboard, subject progress, charts | 4    | [§P16](IMPLEMENTATION_PLAN.md#p16--progress-tracking)              |
| **P17** | Recommendations and "what's next?"                      | 2    | [§P17](IMPLEMENTATION_PLAN.md#p17--recommendations-and-whats-next) |
| **P18** | Notifications and reminders — local scheduler           | 3    | [§P18](IMPLEMENTATION_PLAN.md#p18--notifications-and-reminders)    |
| **P19** | Global search — Postgres full-text, typo-tolerant       | 2    | [§P19](IMPLEMENTATION_PLAN.md#p19--global-search)                  |

## M5 — Ship

| Phase   | What it delivers                                                    | Days | Detail                                                    |
| ------- | ------------------------------------------------------------------- | ---- | --------------------------------------------------------- |
| **P20** | PWA and offline — installable, last content readable, writes queued | 3    | [§P20](IMPLEMENTATION_PLAN.md#p20--pwa-and-offline)       |
| **P21** | Quality bar — accessibility audit, perf budgets, security, export   | 4    | [§P21](IMPLEMENTATION_PLAN.md#p21--quality-bar)           |
| **P22** | Release and daily use — autostart, docs, two-week beta              | 3    | [§P22](IMPLEMENTATION_PLAN.md#p22--release-and-daily-use) |

---

## Where to start

**P0** is the only phase that touches the machine: Node 22, pnpm, Git, GitHub CLI and Docker
Desktop. Once it is done, every later phase is only code.

Current machine state as of 3 October 2026:

| Tool                  | Status                                                        |
| --------------------- | ------------------------------------------------------------- |
| Git 2.55.0            | installed                                                     |
| GitHub CLI 2.101.0    | installed, authenticated                                      |
| Node 24.19.0 LTS      | installed                                                     |
| pnpm 9.15.0           | installed; shim in `%APPDATA%\npm` forwarding to `corepack`   |
| Docker Desktop 4.91.0 | installed; **running** — WSL 3.0.1.0 installed, engine 29.8.0 |
| PostgreSQL 17         | running in Docker on 127.0.0.1:5432, health check passing     |

### Milestone status

| Phase                        | State                                                                                                                                                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** Toolchain             | Done — including the Docker engine and a live PostgreSQL 17 container                                                                                                                                                                           |
| **P1** Design system         | Done — tokens, components, Storybook, dark mode, self-hosted fonts                                                                                                                                                                              |
| **P2** Data foundation       | Done — 30-table schema, generated migrations, seed, storage interface                                                                                                                                                                           |
| **P3** Auth and shell        | Done — Better Auth, route guards, five sections, onboarding                                                                                                                                                                                     |
| **P4** Subjects              | Done — subject/topic CRUD, reorder, archive, templates, detail page                                                                                                                                                                             |
| **P5** Notes                 | Done — editor, autosave, revisions, attachments, import, AI action bar                                                                                                                                                                          |
| **P6** AI platform           | Done — adapters, registry, cache, cost caps, SSE streaming, `/settings`, offline / no-provider states in both AI panels, 97 new tests (contract + prompt goldens)                                                                               |
| **P7** Summaries and Explain | Done — composer with preview, grounded summary, re-askable Explain, save / copy / print                                                                                                                                                         |
| **P8** Quizzes               | Done — composer and theatre runner with drafts, server-side grading with self-marked short answers (two-phase submit), results with weak concepts and mastery, focused retry with comparison, per-topic history                                 |
| **P9** Flashcards            | Done — SM-2 scheduler in `core`, generate → edit → save decks (note or topic), TSV import/export, four-rating flip theatre with interval previews and keyboard, idempotent batch submit with XP, Home "review N now", due/hard/coverage summary |

**The database is PostgreSQL in Docker.** `packages/db/src/client.ts` still supports the
PGlite fallback for when `DATABASE_URL` is unset, but the live database is now the container:
`pnpm db:up` then start the server with `DATABASE_URL` from `.env`. The same generated SQL
applies to both, so the fallback stays free to keep.

Run it:

```bash
pnpm db:up       # start PostgreSQL 17 in Docker
pnpm dev:all     # API on :4321 + web on :5173
pnpm verify      # typecheck, lint, tests
pnpm storybook   # component catalogue on :6006
pnpm db:seed     # 50 levels, 8 achievements
```

## Definition of done (applies to every phase)

1. Works in light **and** dark theme, mobile **and** desktop widths.
2. Keyboard operable, visible focus, AA contrast, screen-reader labels on progress components.
3. Loading, empty, error and offline states designed and implemented — not placeholders.
4. Unit tests for logic; one Playwright journey if the phase has a user-facing flow.
5. Zod contract for anything crossing the API boundary; no `any` in new code.
6. Storybook story for every new component.
7. Small, conventional commits, pushed to `main`.

## Reference

| Topic                                        | Location                                                  |
| -------------------------------------------- | --------------------------------------------------------- |
| Full phase detail, checklists, exit criteria | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) Part III |
| Design system                                | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) Part I   |
| Architecture, ADRs, data model, API          | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) Part II  |
| Product requirements                         | [PRD.md](PRD.md)                                          |
| Rendered design reference                    | [`design.html`](../design.html)                           |
| PRD section → phase traceability             | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) §26      |

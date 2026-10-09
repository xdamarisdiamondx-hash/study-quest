# Quality bar (P21)

What was measured, how, and what had to change to pass. Every number below came from a run on
this machine against the running app, not from a plan.

## Accessibility

**Method.** axe-core 4.13.0 was loaded into the app and run against every route, in **both
themes**, in the states a student actually reaches — settled, loading, empty and not-found. The
shell's tab order was walked with the keyboard, and the rendered accessibility tree was read
page by page to confirm what a screen reader announces (landmarks, names, states).

| Screen                                       | Light | Dark |
| -------------------------------------------- | ----- | ---- |
| `/sign-in`, `/onboarding` steps 1–4          | 0     | 0    |
| `/onboarding` subject picker (selected rows) | 0     | 0    |
| `/`, `/plan`, `/tasks`, `/study`             | 0     | 0    |
| `/study/:id` (overview + tabs)               | 0     | 0    |
| `/study/:id/notes`                           | 0     | 0    |
| `/quests`, `/progress`, `/sessions`          | 0     | 0    |
| `/search`, `/settings`                       | 0     | 0    |

**Violations found, and the fix for each:**

| Rule                             | Where                                                                                                                                                  | Fix                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `color-contrast` 1.82:1          | Selected monogram tile — `[data-theme="dark"] .sq-mono` (specificity 0,2,0) outranked `.sq-mono-active`, so dark painted sand-300 on the violet accent | Restate the active tile for both themes so it wins the cascade and uses `--on-accent` (7:1)                                          |
| `color-contrast` 4.44:1          | Onboarding picker: `--muted` on the selected row's `--iris-50` tint (AA needs 4.5:1 at 13px)                                                           | Selected-row helper text steps to `--sand-600` in light (7:1); dark keeps `--muted`, which already clears 6:1 on its near-black tint |
| `color-contrast` (design system) | `Segmented` count badge: `--iris-800` ink on dark's near-black `--iris-100` tint (~1.5:1)                                                              | Dark override to `--iris-300` (7.4:1)                                                                                                |
| `label-content-name-mismatch` ×2 | Header search button (visible "Ctrl K" not inside the name "Search") and account button (visible initials not inside "Account menu")                   | Names now carry the visible text: `Search (Ctrl K)`, `Account menu — FA`                                                             |
| `page-has-heading-one`           | Subject and notes pages had **no `h1` while loading** — the heading only arrived with the data                                                         | Screen-reader-only `h1` in the loading and not-found branches, so the page has a heading from the first paint                        |
| `landmark-one-main`, `region`    | Only seen while axe ran during the session-check splash; the settled shell always has `banner`/`main`/`navigation`                                     | No change needed — the transient screen is a `role="status"` splash by design                                                        |

**Keyboard.** Tabbing Home walks header → content → footer navigation; every focused control
painted the two-ring indicator (`--card` ring + `--accent` ring) against both backgrounds. No
keyboard trap, no focusable element without a visible focus state.

**Screen-reader structure** (from the accessibility tree): `banner` with the wordmark, named
controls (`Search (Ctrl K)`, `Notifications`, `Switch to light theme`, `Account menu — FA`),
`main` for the page, and `navigation "Sections"` with the five route links.

**Lighthouse** (local profile — the tool does not emulate a device or throttle): **Accessibility
1.0, Best Practices 1.0, SEO 1.0**, zero failed audits. SEO needed a `meta description` in
`index.html` and a valid `robots.txt`; both were missing.

## Performance

`scripts/budget.mjs` runs in CI's build job (`Size budgets`, after `pnpm --filter @sq/web build`)
and locally as `pnpm budget`. A budget nobody enforces is a wish, so this one fails the build:

| Asset                          | Measured         | Budget        |
| ------------------------------ | ---------------- | ------------- |
| Initial JS (gzipped)           | 119.0 KB         | 200 KB        |
| Initial CSS (gzipped)          | 10.8 KB          | 60 KB         |
| `fraunces-latin-*.woff2`       | 65.8 KB          | 120 KB / file |
| `inter-latin-*.woff2`          | 47.1 KB          | 120 KB / file |
| Largest image (`icon-512.png`) | 58.5 KB          | 200 KB / file |
| Route chunks                   | 26 (all gzipped) | —             |

Route splitting landed in this phase: every page is a `lazy()` chunk, so the 119 KB is what the
first paint actually costs. The font check is a tripwire by design — the design is a system
stack, so any font file appearing at all is a regression worth a failed build.

## Security review

| Area                | Finding                                                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session cookie      | `better-auth.session_token` is `HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`. `Secure` is added by Better Auth when the connection is HTTPS (LAN mode serves HTTPS via `pnpm lan`); on plain `http://localhost` a `Secure` cookie would simply be dropped |
| Rate limits         | `/api/auth/*` 15/min and `/api/ai/*` 20/min per caller key (`createLimiter`), pinned by `ratelimit.test.ts`; LAN PIN failures already converge to 429 (P20)                                                                                                   |
| Body limits         | 12 MB on `/api/*`, 250 MB on `/api/import` — an import cannot exhaust memory by accident                                                                                                                                                                      |
| Input validation    | Every route that accepts a body parses it with Zod before touching the database (`routes/*.ts`); contracts are shared with the client                                                                                                                         |
| Secrets in the repo | `git ls-files` contains no `.env`, key or certificate; pattern scan for AWS/GitHub/OpenAI/PEM/Neon-style secrets over tracked files returns nothing                                                                                                           |
| Local artefacts     | `.gitignore` now rejects `.smoke-*`, `sq-*cookies*.txt`, `errors.txt`, `typecheck.txt` and `*.log` — the smoke runs write live session tokens to those files, so they must never be committable                                                               |
| Error reporting     | Local file only (`apps/server/src/log.ts`), surfaced in Settings → Diagnostics with a copy action. Nothing is sent anywhere                                                                                                                                   |

## Data portability and backup

- **Export** (`GET /api/backup`, `services/export.ts`) streams the same archive the scheduler
  writes: database dump + attachments + a config template + README.
- **Restore** (`POST /api/import`) is replace-not-merge behind an explicit confirm.
- **Round trip** is covered by `export.test.ts` (part of the 462-test suite `pnpm verify` runs).
- **Automation**: `services/backup.ts` on the scheduler writes `data/backups` daily and keeps the
  last 14; `scripts/db-backup.ps1` registers the Windows scheduled task.
- **Nudge**: Settings → Data shows the last backup and its age, and says so in words when it is
  older than a day — no badge to dismiss.

## Error reporting, states and i18n

- **Errors**: `ErrorBoundary` at the app root, `RouteFallback` for lazy routes, `capture.ts`
  batches client errors into the local log, `/api/diagnostics` + `DiagnosticsCard` expose a
  "copy diagnostics" action.
- **State sweep**: grep across the repo for placeholder copy (`lorem`, `TODO`, `FIXME`,
  `coming soon`) returns only this plan's own wording. Every audited screen rendered a designed
  loading, empty or error state; the two that were heading-less are fixed above.
- **i18n**: `lib/i18n.ts` centralises every date/time format behind `LOCALE` plus a keyed `t()`
  catalogue. The last four hand-rolled `toLocale*` call sites (reminders, notification bell,
  settings timestamps) now go through it, and the three panels that formatted their own dates
  import `formatMonthDay`. `en` is the only locale, so a partial extraction can never show a
  student a raw key.

## Reproducing it

```bash
pnpm verify    # typecheck + lint + tests (462)
pnpm budget    # build + size budgets
```

The axe run needs the app up (`pnpm dev:all`) and axe-core injected per route; the rest is CI.

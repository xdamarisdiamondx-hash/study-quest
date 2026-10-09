# Study Quest — user guide

How to run the app, use it every day, and fix the things that actually go wrong. The
build history lives in [PHASES.md](PHASES.md); this page is for someone who just wants
the app up.

---

## 1. Quick start

Prerequisites: **Node 22 LTS** and **pnpm**. Docker is optional (see
[§5](#5-which-database-am-i-using)).

```powershell
.\scripts\setup.ps1   # one-time: checks tools, writes .env, installs, starts the database
```

```bash
pnpm install     # if you are not using setup.ps1
pnpm dev:all     # API on :4321 + web app on :5173
```

Open **http://localhost:5173**, create an account, and onboarding walks you through the
five screens. The last step offers starter subjects; one of them (Physics) arrives with a
worked example — a real note, quiz and deck — so the app is never an empty shell.

### Running it like an app (one process, no terminal)

```powershell
.\scripts\start.ps1                 # builds the web app, serves http://localhost:4321
.\scripts\install-autostart.ps1      # then start it automatically at Windows logon
```

`start.ps1` serves the built app **and** the API from the same process on `:4321`, so
there is no dev server to keep running. `install-autostart.ps1` registers a scheduled
task ("Study Quest") that does the same thing when you sign in to Windows:

| Command                                    | What it does                               |
| ------------------------------------------ | ------------------------------------------ |
| `scripts\install-autostart.ps1`            | Register (re-running replaces the task)    |
| `scripts\install-autostart.ps1 -Status`    | What is registered, and when it last ran   |
| `scripts\install-autostart.ps1 -Uninstall` | Remove it again                            |
| `scripts\install-autostart.ps1 -Run`       | Run the task body by hand (how to test it) |

The task writes a transcript to **`data\autostart.log`** — if the app did not come up at
logon, that file says why (it is capped at 512 KB, so it stays readable).

### Useful commands

| Command          | What it does                                                                     |
| ---------------- | -------------------------------------------------------------------------------- |
| `pnpm verify`    | Typecheck, lint and every unit test                                              |
| `pnpm budget`    | Build, then check the bundle against its size budget                             |
| `pnpm storybook` | Component catalogue on http://localhost:6006                                     |
| `pnpm db:seed`   | Rewrite the 50 levels and 10 achievements (the server also writes these at boot) |
| `pnpm lan`       | Build and serve over HTTPS so a phone can install the PWA                        |

---

## 2. Daily use

- **Home** answers "what now?": today's quest, what is due, what to review next.
- **Plan** turns deadlines into a day you can finish; **Tasks** holds the raw list.
- **Study** is subjects → topics → notes, quizzes and flashcards.
- **Quests** are bigger goals with steps; **Progress** shows XP, streaks and achievements.
- `Ctrl`/`⌘ + K` opens search across everything, typo-tolerant.
- The app installs to your home screen (desktop or phone) and keeps working offline:
  pages you have opened stay available, edits queue on the device and sync in order when
  you are back online.

**Export before you erase.** Settings → Data → Export everything writes an archive of
everything the app knows about you. Erasing is immediate and cannot be undone.

---

## 3. Your data and privacy

Everything lives in one PostgreSQL database plus a few folders in the project directory
(`data/files/` attachments, `data/backups/` a daily zip kept for fourteen days,
`data/logs/server.log` server errors). **`/privacy`** is a page in the app that lists all
of it, explains what leaves the machine (AI requests you trigger, a hosted database if
you configured one, LAN mode) and offers two actions:

- **Erase my data** — every subject, note, quiz, card, task and quest is deleted; you
  stay signed in and onboarding starts again. Your display name and timezone survive.
- **Delete my account** — the same, plus your email, password and sessions.

There is no analytics, telemetry or crash reporting anywhere in the app.

---

## 4. Troubleshooting

**The scheduled task ran but nothing is listening.**
Read `data\autostart.log`. The usual causes, in order:

- _pnpm was not found_ — the logon shell does not have pnpm on its `PATH`. Install pnpm
  with the standalone installer (it adds itself to `PATH`), then re-register the task.
- _The build failed_ — run `pnpm --filter @sq/web build` by hand and read the error.
- _The local database never became ready_ — Docker Desktop was not up in time; start it
  and run `scripts\install-autostart.ps1 -Run`.

**The app loads but data seems to be in the wrong place.**
The server logs `[db] driver: postgres` (your `DATABASE_URL`) or `[db] driver: pglite`
(the built-in database). If it says `pglite` while `.env` has a `DATABASE_URL`, the
configured database was unreachable and the server fell back to an empty local one —
look for the warning that says exactly that, fix the connection, then restart. **Anything
you did while it was falling back is in `data/pgdata`, not in your real database.**

**Sign-in fails even though the password is right.**
Older builds rejected `http://localhost:<port>` when `HOST=127.0.0.1` (two names for the
same socket, one origin to the auth layer). Update to the current build; the server now
trusts both loopback spellings of its own port. `BASE_URL` in `.env` overrides the
origin explicitly if you serve under a name of your own.

**The database container will not start.**
Docker is only needed when `DATABASE_URL` points at this machine (`localhost` /
`127.0.0.1`). Point it at a hosted Postgres such as Neon and no container is involved;
remove it entirely and the app uses its built-in PGlite database. `scripts\start.ps1`
makes this choice automatically.

**`data/pgdata` is corrupt or a previous run left it locked.**
Stop the server, rename the folder (do not delete it — your data may be in there), and
start again: the server recreates it.

**Port 4321 is already in use.**
Two copies of the server are running (a terminal session _and_ the scheduled task, for
instance). `Get-Process node | Stop-Process -Force` stops the lot, then start one.

**AI features offer setup guidance instead of answering.**
No provider is configured. The order of preference is local Ollama → free cloud tier →
your own key; set the variables in `.env` (see `.env.example`) and restart. The app works
with none of them set.

**Attachments stay on disk.**
That is the default: without R2 credentials, files go to `data/files/`. Setting
`R2_*` in `.env` moves them to your own bucket.

---

## 5. Which database am I using?

| `.env` says                                            | What runs                                                                  |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| `DATABASE_URL=...localhost...` / `127.0.0.1`           | PostgreSQL 17 in Docker (`pnpm db:up`)                                     |
| `DATABASE_URL=...` (anything else, e.g. a Neon branch) | That hosted database — no Docker involved                                  |
| No `DATABASE_URL`                                      | PGlite, real PostgreSQL compiled to WebAssembly, running inside the server |

All three apply the same generated migrations. The server writes the level curve and
achievement catalogue itself at boot, so a freshly migrated database is usable without a
separate seed step.

---

## 6. Where things live

| Path                   | Contents                                                  |
| ---------------------- | --------------------------------------------------------- |
| `data/autostart.log`   | Transcript of the last few logons (why did it not start?) |
| `data/logs/server.log` | Server errors, also what "Copy diagnostics" hands over    |
| `data/backups/`        | Daily database zips, kept fourteen days                   |
| `data/files/`          | Attachments when R2 is not configured                     |
| `data/pgdata/`         | The built-in database (only when no `DATABASE_URL`)       |
| `.env`                 | Database, AI and storage settings — git-ignored           |
| `docs/PHASES.md`       | What was built, phase by phase                            |

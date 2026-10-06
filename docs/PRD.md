# Study Quest — Product Requirements Document

|             |                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Product** | Study Quest                                                                                                                         |
| **Version** | 1.0                                                                                                                                 |
| **Author**  | Praise                                                                                                                              |
| **Source**  | `Study Quest PRD.docx`                                                                                                              |
| **Notes**   | [Appendix A](#appendix-a--notes-technical-approach-and-decisions) — technology choices, rationale and trade-offs (added after v1.0) |

> Sections 1–34 are the original requirements, unchanged. Appendix A is an engineering note
> recording the decisions taken to build it.

---

## 1. Product Overview

Study Quest is a study and task-management app designed mainly for secondary school and
university students, while also being useful for independent learners.

Study Quest combines:

- Task management
- Study planning
- Notes
- AI-powered summaries
- Explanations
- Quiz generation
- Flashcards
- Reading assistance
- Progress tracking
- Gamification
- Study quests

The goal is not simply to give students another place to write notes or check tasks off.
Study Quest should guide students through the entire learning journey:

> **Plan → Study → Understand → Practice → Quiz → Review → Improve**

## 2. Product Vision

Study Quest should make studying feel more organized, interactive, and rewarding.

A student should be able to open the app and understand:

- What they need to do.
- What they should study.
- What they need to improve.
- How they are progressing.
- What they should do next.

The app should feel like a personal study companion and quest guide, rather than a normal
task manager.

## 3. Target Users

**Primary Users**

- Secondary school students
- University students

**Secondary Users**

- Independent learners
- People preparing for exams
- People learning a new subject or skill

## 4. Core Product Experience

The main experience of Study Quest is a guided study journey.

For example — **Chemistry Exam Quest**:

- **Goal:** Prepare for an upcoming Chemistry test.

Study Quest could guide the student through:

1. Add or write Chemistry notes.
2. Read the notes.
3. Generate a summary.
4. Ask Study Quest to explain difficult concepts.
5. Create flashcards.
6. Take a quiz.
7. Review incorrect answers.
8. Take a short retry quiz.
9. Mark the topic as completed.
10. Earn XP and progress toward the larger goal.

The student can choose how much guidance they want. They can simply complete a task, use a
focus session, or follow the complete learning journey.

## 5. Home Dashboard

The home screen should focus mainly on progress and motivation, while also showing important
information from the rest of the app.

**Main sections**

- **Progress**
  - Current level
  - XP
  - Current streak
  - Achievements
  - Overall study progress
- **Today's Quest**
  - Current study goals
  - Tasks to complete
  - Recommended study sessions
- **Continue Learning**
  - Shows the subject or topic the student was last studying.
- **Upcoming**
  - Upcoming deadlines
  - Tests
  - Important study goals
- **Quick Actions**
  - Add task
  - Add notes
  - Start studying
  - Create quiz

The dashboard should stay clean and not overwhelm the student with too much information.

## 6. Subjects and Topics

Students can create their own subjects.

**Examples**

- **Physics:** Motion, Electricity, Waves, Heat
- **Mathematics:** Algebra, Trigonometry, Probability, Calculus

The app should automatically provide a simple structure:

> **Subject → Topic → Notes / Quizzes / Flashcards / Tasks**

Students can also customize the structure when needed.

## 7. Notes

Students should be able to type or paste notes into Study Quest.

Each set of notes can belong to a subject and a topic.

**Example**

- Subject: Biology
- Topic: Photosynthesis
- Notes: Student's original notes

Once notes are added, Study Quest should provide several actions.

**Note Actions**

- Summarize
- Explain
- Generate quiz
- Generate flashcards
- Read aloud
- Start study session

## 8. AI Summary Feature

Students can turn their notes into summaries.

They should be able to choose:

- **Length:** Quick, Standard, Detailed
- **Format:** Paragraph, Bullet points, Key points, Exam-style notes

**Example — Quick + Bullet Points (Photosynthesis)**

- Occurs mainly in plant leaves
- Uses light energy
- Produces glucose
- Releases oxygen

The summary should remain focused on the student's notes and should clearly separate
additional explanations from the original material.

## 9. Explain Feature

Students should be able to select something they don't understand and ask Study Quest to
explain it.

The explanation should be easy to understand.

**Possible explanation styles**

- Simple explanation
- Step-by-step explanation
- Example
- Real-life example
- Explain like I'm a beginner

**Example**

- Student: "I don't understand momentum."
- Study Quest: Provides a simple explanation and an example.

The student should then be able to ask for another explanation if they still don't
understand.

## 10. Read My Notes

Study Quest should have a dedicated Read My Notes experience.

Students can:

- **Listen** — Study Quest reads their notes aloud.
- **Read** — Notes are displayed in a clean reading mode.
- **Follow Along** — Important parts can be highlighted while the notes are being read.
- **Ask for Help** — If the student doesn't understand something, they can pause and ask
  "Explain this." Study Quest then explains the difficult section in simpler language.

This turns reading notes into an interactive learning experience instead of simply listening
to text.

## 11. Quiz Generator

Study Quest can create quizzes directly from a student's notes.

Students should be able to choose:

- **Number of Questions:** e.g. 5, 10, 15, 20
- **Question Types:** Multiple choice, True/False, Short answer
- **Difficulty:** a simple choice of Easy / Medium / Hard, or a more detailed difficulty
  slider from Very Easy → Very Challenging

## 12. Quiz Results

After completing a quiz, Study Quest should show:

- Score
- Correct answers
- Incorrect answers
- Explanations
- Topics the student struggled with

**Example**

- Quiz Result: 7/10
- Needs Review: Newton's Second Law, Momentum

Study Quest can then recommend:

> Review these topics → Retry Quiz

## 13. Smart Retry Quizzes

When a student gets questions wrong, Study Quest should be able to create a smaller quiz
focused on those areas.

**Example**

- You missed 3 questions about momentum.
- **Retry Quiz: Momentum** — 5 questions focused on the concepts the student struggled with.

This creates a continuous cycle:

> **Quiz → Mistakes → Review → Retry → Improve**

## 14. Flashcards

Study Quest should be able to turn notes into flashcards.

**Example**

- **Front:** What is photosynthesis?
- **Back:** The process by which plants use light energy to produce food.

Students can:

- Study normally
- Flip cards
- Mark cards they know
- Mark cards they need to review
- Repeat difficult cards

Flashcards should also be connected to the relevant topic.

## 15. Task Manager

Study Quest should include a full but simple task manager.

Students can create:

- Homework
- Assignments
- Revision tasks
- Projects
- Personal tasks
- Study goals

Tasks can include:

- Title
- Subject
- Topic
- Deadline
- Priority
- Notes
- Related study activity

## 16. Recurring Tasks

Students can create repeating tasks.

**Examples**

- Study Mathematics every Monday, Wednesday and Friday.
- Review Chemistry every Sunday.
- Practice coding every evening.

This makes Study Quest useful for long-term study habits.

## 17. Connected Tasks

Tasks should connect naturally with studying.

**Example**

- **Task:** Complete Physics Assignment — Subject: Physics, Topic: Motion, Deadline: Friday

Study Quest could suggest:

> Before completing this task, review Motion for 20 minutes and take a short quiz.

This makes the task manager part of the learning system instead of a separate feature.

## 18. Study Planning

Study Quest should support three planning styles.

- **Manual** — the student creates their own study schedule.
- **Suggested** — Study Quest recommends what the student should study.
- **Automatic** — Study Quest creates a study plan based on upcoming deadlines, tests,
  unfinished tasks, study goals, and available study time.

The student can always edit the suggested plan before starting.

## 19. Daily Study Quest

Each day, Study Quest can create a personalized list of things to accomplish.

**Example — Today's Quest**

- **Chemistry**
  - Review Atomic Structure — 25 min
  - Complete quiz — 10 min
- **Mathematics**
  - Complete assignment — 30 min
- **Physics**
  - Review Motion — 20 min
- **Progress:** 2/4 completed

The student can start the quest and move through the activities.

## 20. Quest System

Quests should represent study goals, rather than simply giving normal tasks a different name.

**Example — Master Photosynthesis**

- Quest Progress: 3/5
- ✅ Read notes
- ✅ Review summary
- ✅ Study flashcards
- 🔒 Complete quiz
- 🔒 Pass final challenge

Completing a larger quest gives the student a meaningful sense of progress.

## 21. Larger Special Quests

Occasionally, Study Quest can offer larger quests such as:

- **Exam Quest** — Prepare for Biology Exam
- **Weekly Quest** — Complete 5 study sessions this week
- **Subject Quest** — Master Algebra
- **Personal Quest** — Improve my Physics score

These should be occasional so that the app doesn't become overloaded with quests.

## 22. Gamification

Gamification should be a major part of Study Quest.

Students can earn:

- XP
- Levels
- Streaks
- Badges
- Achievements
- Milestones
- Quest rewards

**Examples**

- +50 XP — Completed Chemistry quiz.
- +100 XP — Completed a study session.
- +500 XP — Completed a major subject quest.

## 23. Achievements

Achievements reward meaningful progress.

**Examples**

- **First Quest** — Complete your first Study Quest.
- **Quiz Master** — Complete 10 quizzes.
- **Consistent Learner** — Study for 7 days in a row.
- **Subject Explorer** — Study 5 different subjects.
- **Comeback** — Improve your score after reviewing your mistakes.

Achievements should encourage actual learning, not simply opening the app.

## 24. Progress Tracking

Study Quest should show progress over time.

Students should be able to see:

- Study time
- Completed tasks
- Completed quests
- Quiz scores
- Quiz improvement
- Subjects studied
- Topics completed
- Current streak
- XP
- Achievements

The app should make progress easy to understand visually.

## 25. Subject Progress

Each subject should have its own progress area.

**Example — Physics**

- Overall Progress: 68%
- Topics: Motion — 90%, Electricity — 75%, Waves — 50%, Heat — 30%

The percentage should reflect meaningful activity such as completing study sessions, quizzes,
reviews, and quests.

## 26. Study Sessions

Students should have different ways to study.

- **Quick Focus** — simply work on the selected task.
- **Focus Session** — study for a chosen amount of time.
- **Guided Study** — Study Quest takes the student through
  Read → Understand → Practice → Quiz → Review.

Students can choose whichever mode suits them.

## 27. Recommendations

Study Quest should occasionally recommend the next best activity based on what the student
has been doing.

**Examples**

- You haven't reviewed Electricity recently.
- You scored 5/10 on your last Chemistry quiz. Try a quick review.
- Your Maths assignment is due tomorrow.
- You've been studying Biology consistently. Keep your streak going!

Recommendations should feel helpful rather than overwhelming.

## 28. Notifications and Reminders

Students should be able to receive reminders for:

- Upcoming deadlines
- Planned study sessions
- Quests
- Revision
- Streaks
- Unfinished tasks

Students should have control over which reminders they receive.

## 29. Search

Students should be able to search across their Study Quest content.

Search should help them find:

- Subjects
- Topics
- Notes
- Tasks
- Quizzes
- Flashcards
- Quests

**Example** — searching "Newton" could show:

- Physics → Motion notes
- Newton's Laws quiz
- Newton's Laws flashcards
- Physics revision task

## 30. Overall User Journey

A typical Study Quest experience should look like this:

| Step | Stage          | What happens                                                                      |
| ---- | -------------- | --------------------------------------------------------------------------------- |
| 1    | **Plan**       | The student adds their assignments, deadlines, tests, and study goals.            |
| 2    | **Organize**   | They create subjects and topics.                                                  |
| 3    | **Add Notes**  | They type or paste their study material.                                          |
| 4    | **Understand** | Study Quest creates summaries and explanations.                                   |
| 5    | **Study**      | The student reads, listens, or follows a guided study session.                    |
| 6    | **Practice**   | Study Quest creates flashcards and quizzes.                                       |
| 7    | **Review**     | The app identifies weak areas.                                                    |
| 8    | **Retry**      | The student takes a focused retry quiz.                                           |
| 9    | **Complete**   | The student finishes their task or quest.                                         |
| 10   | **Progress**   | They earn XP, unlock achievements, maintain their streak, and see their progress. |

## 31. Main Sections of the App

Study Quest should have five main areas:

1. **Home** — Progress, today's quest, current goals, and recommendations.
2. **Tasks** — Assignments, deadlines, recurring tasks, and study tasks.
3. **Study** — Subjects, topics, notes, summaries, flashcards, explanations, and quizzes.
4. **Quests** — Current quests, completed quests, special quests, and progress.
5. **Progress** — XP, levels, streaks, achievements, statistics, and subject progress.

## 32. MVP — First Version

The first version should focus on the features that make Study Quest's identity clear.

**Essential**

- Home dashboard
- Subjects and topics
- Task manager
- Notes
- AI summaries
- AI explanations
- Quiz generation
- Multiple question types
- Difficulty selection
- Quiz results
- Retry quizzes
- Flashcards
- Read My Notes
- Study sessions
- Daily quests
- XP
- Levels
- Streaks
- Basic achievements
- Progress tracking
- Study planning

**Later Features**

These can come after the main experience is working well:

- Photo notes
- PDF/document uploads
- More advanced achievements
- More types of special quests
- Social features
- Leaderboards
- Shared study groups
- More advanced personalization

## 33. Product Principles

Study Quest should follow five important principles:

1. **Learning comes first** — Gamification should encourage learning, not distract from it.
2. **Simple but powerful** — There should be many useful features without making the app
   confusing.
3. **Everything should connect** — Tasks, notes, quizzes, subjects, quests, and progress
   should work together.
4. **Students stay in control** — The app can recommend what to do, but students should be
   able to change their plans and choices.
5. **Always answer "What's next?"** — After completing something, Study Quest should help
   the student understand what they can do next.

## 34. The Core Idea

The biggest idea behind Study Quest is:

> **Don't just tell students what they need to study. Help them actually learn it.**

A student should be able to go from:

> "I have a Chemistry test."

to:

> Plan → Add Notes → Summarize → Understand → Study → Quiz → Review Mistakes → Retry →
> Complete Quest → Earn XP → Track Progress

That is what makes Study Quest more than just a task manager or study app.

---

# Appendix A — Notes: technical approach and decisions

**Status:** working notes · **Added:** after PRD v1.0 · **Detail:**
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)

## What this appendix is

This is a **working note**, not a signed-off specification. Sections 1–34 above are the product
requirements. Everything below this line is the engineering record kept alongside them: which
technologies were chosen to build the product, where each one runs, why, what was rejected, what
each decision costs, and what changed as the design was reviewed.

It is expected to change as the build goes on — that is the point of writing it down. Treat §1–34
as the requirements and this appendix as the reasoning behind them.

| Section   | Covers                                                                |
| --------- | --------------------------------------------------------------------- |
| A.1 – A.6 | Technology decisions: stack, what changed and why, alternatives, cost |
| A.7       | Design changes made to the first preview, and why                     |
| A.8       | Product decisions taken while building (subjects and topics)          |
| A.9       | Where the full detail lives                                           |

**Decided so far:** React 19 + Vite · PostgreSQL 17 in Docker · Better Auth · Cloudflare R2 for
files · provider-agnostic AI with Ollama first. The app and database run locally. The interface
uses one accent hue (`iris`), warm neutrals (`sand`), and one logo.

## A.1 Decision summary

| Concern        | Decision                                        | Runs                       |
| -------------- | ----------------------------------------------- | -------------------------- |
| App framework  | React 19 + TypeScript + Vite (PWA)              | Local                      |
| Database       | PostgreSQL 17 + Drizzle ORM, in Docker          | Local container            |
| Authentication | Better Auth — email + password, session cookies | Local                      |
| File storage   | Cloudflare R2 (S3-compatible)                   | Cloud (the only exception) |
| Server         | Hono on Node.js 22                              | Local                      |
| Styling        | Tailwind CSS v4 + design tokens                 | —                          |
| AI             | Provider-agnostic adapters; Ollama first        | Local or cloud             |
| Search         | PostgreSQL full-text + `pg_trgm`                | Local container            |
| Cost           | Everything on a free tier or free software      | $0                         |

**The app and the database run locally** on one Windows machine. `pnpm dev` starts the database
container and the app server; access is from that machine, or from a phone on the same Wi-Fi.
There is no cloud deployment.

## A.2 What changed, and why

Four decisions changed after the first draft of the technical plan.

### Database: SQLite → PostgreSQL

**Was:** a single SQLite file with no server to run.
**Now:** PostgreSQL 17 in a Docker container.
**Why:**

- The data is deeply relational — subjects → topics → notes → quizzes → attempts → answers,
  plus XP events, streaks and quest steps. Postgres enforces that with real constraints and
  foreign keys; SQLite would leave integrity to application code.
- XP must never be double-counted. That needs a database-level unique constraint
  (`user_id, reason, source_type, source_id`) — natural in Postgres, awkward in SQLite.
- Progress rollups (subject %, topic mastery) are aggregate queries over joins. Postgres does
  this well; SQLite requires denormalising and hand-rolled aggregation.
- AI output, settings and achievement criteria are irregular shapes that map cleanly to
  `jsonb`.
- Search is built in: full-text with `pg_trgm` gives ranked, typo-tolerant results across
  every entity type (§29) with no extra service.
- It is the same database the app would use if ever hosted, so nothing has to be rewritten
  later.

**Why Docker rather than a Windows service:** Docker pins the exact Postgres version and the
`pg_trgm` extension in the repository, so the database cannot change underneath the app. It
also gives a complete, clean delete of all data (`docker compose down -v`) and leaves nothing
behind on the machine.
**Cost:** Docker Desktop must be installed (needs WSL 2) and is the largest dependency on the
system; one extra process to start. Mitigated by a single `pnpm dev` command and a health check
that waits for the database before the app boots.

### Authentication: hand-rolled sessions → Better Auth

**Was:** custom email + password with scrypt hashing and session cookies written by hand.
**Now:** Better Auth, self-hosted inside the app server.
**Why:**

- Password hashing, session rotation, and expiry are easy to get subtly wrong. Better Auth is
  a mature, MIT-licensed library that does them correctly, and it keeps all credential data in
  the local database — nothing is sent to a third party.
- It is free, runs on our own machine, and supports exactly the model we need (email +
  password, database-backed sessions, httpOnly cookies).
- Less bespoke security code to maintain in a project this size.
  **Cost:** a real dependency whose schema and API we must track, and we still own LAN-access
  PINs and route rate-limiting.

### File storage: local disk → Cloudflare R2

**Was:** uploaded files in a folder next to the database.
**Now:** a private Cloudflare R2 bucket, via its S3-compatible API, with local disk as the
fallback.
**Why:**

- R2's free tier is genuinely usable: **10 GB-month storage, 1M writes/month, 10M reads/month,
  and no egress fees**. Beyond that it is $0.015/GB-month — so the failure mode is a small
  bill, never a large one.
- Photos and PDFs stay out of local backups and out of the database, so backups stay small and
  fast, and a phone on the LAN can load a large file without streaming it through the PC.
- The S3-compatible API means this is not a dead end: any other S3 provider, or a local disk
  folder, can be swapped in behind the same interface.
  **Cost — and this is the important trade-off:** R2 is a cloud service, so it is the one place
  student content leaves the machine. It needs a free Cloudflare account, it does not work
  offline, and a leaked token could read or delete a bucket. Therefore: uploads are strictly
  opt-in, nothing is ever uploaded without an explicit user action, the token is stored
  server-side in a git-ignored config file and is write-only in the UI, the app is fully usable
  with no R2 configured, and Settings states plainly which files are stored off-device.

### AI: unchanged, but confirmed local-first

Provider-agnostic adapters with **Ollama (running locally) first**, then a free cloud tier, then
the user's own key. The app must work with no AI configured at all, showing clear setup
guidance rather than broken buttons.

## A.3 Alternatives considered and rejected

| Choice               | Alternative                | Why not                                                                                 |
| -------------------- | -------------------------- | --------------------------------------------------------------------------------------- |
| PostgreSQL           | SQLite                     | Needs aggregates, constraints and full-text search; harder to host later                |
| PostgreSQL in Docker | Native Windows service     | Version drift, registry entries, a service that runs forever                            |
| Better Auth          | Hand-rolled sessions       | Security-critical code is easy to get wrong                                             |
| Better Auth          | Hosted auth (Clerk, Auth0) | Sends credentials off-machine, breaks the local-only rule                               |
| Cloudflare R2        | Local folder               | Large files bloat local backups; no phone-friendly streaming                            |
| Cloudflare R2        | S3 / Backblaze             | S3 has egress fees; R2 is free and S3-compatible                                        |
| React + Vite         | Next.js                    | The app is private and behind a login; SSR adds a second rendering model for no benefit |
| React + Vite         | SvelteKit, Nuxt            | Less ecosystem for the interactive study flows this product needs                       |
| Node + Hono          | Next.js API, Firebase      | Keeps the stack one language, one process, zero cost                                    |
| Ollama first         | Cloud AI only              | Local models are free, private, and work offline                                        |

## A.4 What this does not change

The product requirements are unaffected. §32 (MVP scope) still holds, and none of these
decisions add or remove a user-facing feature. Photo notes and PDF upload remain **later
features** per §32 — the R2 decision prepares for them (and enables attachments) but does not
bring them into the MVP.

## A.5 Prerequisites this now requires

| Requirement          | Why                                   | Notes                               |
| -------------------- | ------------------------------------- | ----------------------------------- |
| Node.js 22 LTS       | Runs the app server and the web build | Free                                |
| pnpm                 | Workspace management                  | Free                                |
| Docker Desktop       | Runs PostgreSQL                       | Free; needs WSL 2                   |
| A Cloudflare account | R2 file storage                       | Optional — the app works without it |
| An AI provider       | Summaries, quizzes, flashcards        | Optional — Ollama is free and local |

## A.6 Cost position

Everything is free. The two services that could ever cost money are capped:

| Service       | Free allowance                                   | Cost beyond that                                      |
| ------------- | ------------------------------------------------ | ----------------------------------------------------- |
| Cloudflare R2 | 10 GB storage, 1M writes, 10M reads, free egress | ~$0.015/GB-month                                      |
| AI provider   | Free tiers, or a local Ollama model              | Varies; the app tracks usage and enforces a daily cap |

## A.7 Design changes made to the first preview

Recorded after reviewing the first rendered design. The first preview looked machine-made: too
many colours, nothing meaningful distinguishing them, and four logo variants implying four
different brands. Five changes were made.

### 1. One accent hue instead of a rainbow

**Was:** `indigo` + `violet` as two brand hues, four semantic colours, and an eight-colour
subject palette. A subject list was a row of competing hues where no colour carried meaning.

**Now:** a single accent, `iris`, in ten steps. Warm neutrals (`sand`) carry everything else.

**Why:**

- Colour has to _mean_ something to be worth using. With eight subject hues, none of them
  indicated importance — you could not tell "this needs attention" from "this is just a subject".
- Two brand hues (indigo and violet) plus semantic colours plus gold put eleven hues in play on
  a subject-heavy screen. That is a palette, not a system.
- Warm greys instead of blue-greys, because the warmth is most of what separates a considered
  interface from a default-looking one.

**Cost:** subjects can no longer be colour-coded, which is a real loss of quick visual scanning.
§A.9 covers how that was recovered.

### 2. Subjects identified by monogram, not colour

**Was:** `subjects.colour` column and a picker with eight approved colours.

**Now:** no colour column. A subject is a neutral tile with its initials; the accent appears
only on the one that is active. Multi-series charts use tints of the single accent
(`iris-300` → `iris-700`).

**Why:** scanning is preserved through position, label and the active state, and the eye is
drawn to the subject in focus rather than to whichever hue is loudest. Restoring scanability
with six tints of one hue also removes the "status by colour" problem, where a green subject
could be mistaken for a completed one.

**Cost:** the `subjects` table loses its `colour` column, and P4 loses a colour picker.

### 3. Ambient gradients, restricted

**Was:** gradients reserved for the logo only.

**Now:** soft, blurred, low-opacity accent washes are allowed as an `Ambient` layer, and
explicitly forbidden behind data. Permitted on onboarding, empty states, the Home greeting,
quest completion and login. Forbidden on task lists, quiz screens, reading mode, and anywhere
with dense data.

**Why:** the reference aesthetic depends on soft colour wash behind hero areas — it is what
gives the interface its depth. Without it the same layout reads as flat and generic. The
restriction is what keeps it from becoming decoration everywhere.

**Cost:** an extra decorative layer that must be `aria-hidden`, `pointer-events: none`, and
opacity-limited, plus a lint-level rule so it never creeps onto a data screen.

### 4. One logo, not four variants

**Was:** `logo-mark`, `logo-lockup`, `logo-mono`, `favicon` presented as four usable options.

**Now:** `logo-mark.svg` is _the_ logo and the only one used in the product. `favicon.svg` and
`logo-mono.svg` remain, but are documented as **derivatives** — the favicon is the same drawing
with the spine removed, because the spine is invisible below 32 px. `logo-lockup.svg` was
**deleted**; the app uses the mark beside an already-typeset product name, so a baked-in wordmark
was redundant.

**Why:** four variants of a mark read as four different brands, and the product had no way to
choose between them at runtime. One mark with documented technical derivatives is unambiguous
and still covers favicon and print.

**Cost:** none material. The lockup is gone from the README, replaced by the mark alone.

### 5. Softer geometry and lighter type

**Was:** 8–32 px radii, 44 px touch targets, headings at weight 700–800, a green/gold level
badge, and heavy weights throughout.

**Now:** fully rounded (`999px`) buttons, inputs and chips; 46 px touch targets; headings at
weight 600; one level badge in gold per screen.

**Why:** heavy weights and tight corners were a second contributor to the machine-made feel —
alongside the palette, they were the other giveaway. Dropping heading weight 800 → 600 and
rounding the primary controls to pills matches the reference's softness. The gold level badge
was competing with the accent; gold now appears on roughly one element per screen.

**Cost:** larger radii and taller targets need a little more vertical space in dense lists.

### Net effect

|                              | First preview                                     | Now                                   |
| ---------------------------- | ------------------------------------------------- | ------------------------------------- |
| Hues in play                 | 11 (indigo, violet, gold, 4 semantic, 8 subjects) | 1 accent + gold + 3 status + neutrals |
| Subject identification       | Colour picker                                     | Monogram, accent when active          |
| Logo variants in the product | 4                                                 | 1, plus 2 documented derivatives      |
| Heading weight               | 700–800                                           | 600                                   |
| Primary control shape        | 12 px radius                                      | Fully rounded                         |
| Decorative gradients         | Logo only                                         | Ambient layer, data screens forbidden |

The token rename is a one-pass migration: `indigo-*` → `iris-*`, `slate-*` → `sand-*`,
`success/warning/danger/info` → `ok-*/warn-*/bad-*`, and `violet-*` folded into the accent.
Nothing changes for the user; only the token names in code.

## A.8 Product decisions taken while building

These refine §6 and §25 without changing what they require. They are recorded here because
they are product choices, not just implementation detail.

| Decision                                                                                                                                                                       | Instead of                                                                    | Why                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A topic has a three-state status the student sets: not started / learning / mastered                                                                                           | No status until real study data exists                                        | §25 asks for per-topic progress. A status the student declares gives it a meaning today, and later phases overwrite it with measured mastery instead of replacing the concept.                                                                                                                                                                                                          |
| The status advances by tapping the chip, and wraps at mastered                                                                                                                 | A dropdown or a one-way progression                                           | Principle 4: the student stays in control, but the common action should not cost a menu. Wrapping means the control never dead-ends.                                                                                                                                                                                                                                                    |
| Topics can be reordered by drag **or** by arrow buttons on every row                                                                                                           | Drag only                                                                     | Dragging is imprecise on a phone and impossible with a keyboard or a screen reader. Both paths call the same ordering code so they cannot disagree.                                                                                                                                                                                                                                     |
| Renaming a subject updates its monogram automatically                                                                                                                          | The monogram is set once and drifts                                           | The colour picker was already cut in A.7 §2; a monogram the student has to maintain by hand is the same problem in miniature.                                                                                                                                                                                                                                                           |
| Archived subjects leave the main list but keep their topics                                                                                                                    | Delete-only subjects                                                          | Students finish terms and exams. Archiving keeps the history — and the notes attached to it — without the subject cluttering the day.                                                                                                                                                                                                                                                   |
| Deleting a subject says how many topics go with it and asks twice                                                                                                              | Deleting immediately                                                          | The delete cascades. Principle 4 is as much about being able to back out as it is about choosing.                                                                                                                                                                                                                                                                                       |
| Notes / Quizzes / Flashcards / Tasks tabs exist from day one and say which phase fills them                                                                                    | Building the page out tab by tab later                                        | Principle 3: everything should connect. Fixing the page shape now means the later phases drop content into a settled frame.                                                                                                                                                                                                                                                             |
| Summary and Explain take over the note editor's main area, with a "Back to the note" control                                                                                   | A strip above the editor, or a modal                                          | The answer needs the room the note already has, and it must stay beside the source it came from. A modal hides the note; a strip shrinks both the note and the answer until neither is readable.                                                                                                                                                                                        |
| Grounding is shown structurally: the summary carries a "Grounded in" row naming the note and its word count, and Explain prints the selected passage verbatim above the answer | A sentence saying the answer came from the notes                              | A claim cannot be checked. Putting the actual source on screen lets the student confirm it in one look, which is the only version of this guardrail that means anything (§7).                                                                                                                                                                                                           |
| Stopping or failing a regeneration keeps the last good answer and labels unfinished text "Stopped early"                                                                       | Clearing the panel, or showing partial text as the answer                     | A half-written summary that reads as finished is worse than no summary. The previous answer is still true of the same note, so it stays until something better replaces it.                                                                                                                                                                                                             |
| "Explain another way" keeps every earlier attempt on screen, newest first, older ones dimmed                                                                                   | Replacing the previous attempt                                                | The exit criterion for this phase is a _re-askable_ explanation. Comparing the new way against the old one is the feature; discarding the old one would remove the thing being asked for.                                                                                                                                                                                               |
| A summary or explanation that arrived empty is treated as a failure, not as a result                                                                                           | Storing and replaying whatever the model returned                             | An empty answer cached against the note's content hash would answer every later request for that note with nothing. The model being quiet is a failed attempt, so it fails over like any other error.                                                                                                                                                                                   |
| Settings never asks for an API key: it reports "server key configured" and says the key lives in `.env`                                                                        | A write-only API key field per account                                        | One key already serves every account on this machine, so a per-account field would collect a value that is really per-installation — and a key typed into a browser ends up in local storage, in screenshots and in support requests. `.env` is read server-side only, so there is nothing to leak.                                                                                     |
| When AI cannot run, the run button says why beside itself — "Offline", or "No model connected" with a link to Settings — and works again the moment the condition clears       | A raw transport error in the result area, or a disabled button with no reason | The failure is a condition to fix, not a result to read: the cause and the one page that fixes it belong next to the control they block. The state is read from the health endpoint every fifteen seconds, so recovering needs no reload — and a failure that has already happened never disables the button, because a transient provider error must not cost the student their retry. |

**Cost of the status model:** `topics.status` is a student declaration, not a measurement.
When P8 (quizzes) and P14 (sessions) land, "learning" and "mastered" become derived values
rather than something the student sets, and the chip stops being editable. The transition is a
data change in one place — `topicsApi.update` — because the vocabulary does not change.

## A.9 Where the detail lives

| Topic                                     | Location                                                        |
| ----------------------------------------- | --------------------------------------------------------------- |
| Phase-by-phase build plan                 | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — Part III     |
| Full architecture decisions (ADRs)        | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — Part II, §17 |
| Data model                                | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — §18          |
| Design system                             | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — Part I       |
| Rendered colour, type, buttons and inputs | [`design.html`](../design.html)                                 |
| Full preview with screens and dark mode   | [`design-preview.html`](../design-preview.html)                 |

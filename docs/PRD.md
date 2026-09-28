# Study Quest — Product Requirements Document

| | |
| --- | --- |
| **Product** | Study Quest |
| **Version** | 1.0 |
| **Author** | Praise |
| **Source** | `Study Quest PRD.docx` |
| **Addenda** | [Appendix A](#appendix-a--technical-approach-and-decisions) — technology choices and rationale (added after v1.0) |

> Sections 1–34 are the original requirements, unchanged. Appendix A records the technical
> decisions taken to build it.

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

| Step | Stage | What happens |
| --- | --- | --- |
| 1 | **Plan** | The student adds their assignments, deadlines, tests, and study goals. |
| 2 | **Organize** | They create subjects and topics. |
| 3 | **Add Notes** | They type or paste their study material. |
| 4 | **Understand** | Study Quest creates summaries and explanations. |
| 5 | **Study** | The student reads, listens, or follows a guided study session. |
| 6 | **Practice** | Study Quest creates flashcards and quizzes. |
| 7 | **Review** | The app identifies weak areas. |
| 8 | **Retry** | The student takes a focused retry quiz. |
| 9 | **Complete** | The student finishes their task or quest. |
| 10 | **Progress** | They earn XP, unlock achievements, maintain their streak, and see their progress. |

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

# Appendix A — Technical approach and decisions

Added after v1.0 · Full detail in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)

This appendix records **which** technologies were chosen to build Study Quest, **where** each
one runs, and **why** — including the alternatives that were considered and what each choice
costs us.

## A.1 Decision summary

| Concern | Decision | Runs |
| --- | --- | --- |
| App framework | React 19 + TypeScript + Vite (PWA) | Local |
| Database | PostgreSQL 17 + Drizzle ORM, in Docker | Local container |
| Authentication | Better Auth — email + password, session cookies | Local |
| File storage | Cloudflare R2 (S3-compatible) | Cloud (the only exception) |
| Server | Hono on Node.js 22 | Local |
| Styling | Tailwind CSS v4 + design tokens | — |
| AI | Provider-agnostic adapters; Ollama first | Local or cloud |
| Search | PostgreSQL full-text + `pg_trgm` | Local container |
| Cost | Everything on a free tier or free software | $0 |

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

| Choice | Alternative | Why not |
| --- | --- | --- |
| PostgreSQL | SQLite | Needs aggregates, constraints and full-text search; harder to host later |
| PostgreSQL in Docker | Native Windows service | Version drift, registry entries, a service that runs forever |
| Better Auth | Hand-rolled sessions | Security-critical code is easy to get wrong |
| Better Auth | Hosted auth (Clerk, Auth0) | Sends credentials off-machine, breaks the local-only rule |
| Cloudflare R2 | Local folder | Large files bloat local backups; no phone-friendly streaming |
| Cloudflare R2 | S3 / Backblaze | S3 has egress fees; R2 is free and S3-compatible |
| React + Vite | Next.js | The app is private and behind a login; SSR adds a second rendering model for no benefit |
| React + Vite | SvelteKit, Nuxt | Less ecosystem for the interactive study flows this product needs |
| Node + Hono | Next.js API, Firebase | Keeps the stack one language, one process, zero cost |
| Ollama first | Cloud AI only | Local models are free, private, and work offline |

## A.4 What this does not change

The product requirements are unaffected. §32 (MVP scope) still holds, and none of these
decisions add or remove a user-facing feature. Photo notes and PDF upload remain **later
features** per §32 — the R2 decision prepares for them (and enables attachments) but does not
bring them into the MVP.

## A.5 Prerequisites this now requires

| Requirement | Why | Notes |
| --- | --- | --- |
| Node.js 22 LTS | Runs the app server and the web build | Free |
| pnpm | Workspace management | Free |
| Docker Desktop | Runs PostgreSQL | Free; needs WSL 2 |
| A Cloudflare account | R2 file storage | Optional — the app works without it |
| An AI provider | Summaries, quizzes, flashcards | Optional — Ollama is free and local |

## A.6 Cost position

Everything is free. The two services that could ever cost money are capped:

| Service | Free allowance | Cost beyond that |
| --- | --- | --- |
| Cloudflare R2 | 10 GB storage, 1M writes, 10M reads, free egress | ~$0.015/GB-month |
| AI provider | Free tiers, or a local Ollama model | Varies; the app tracks usage and enforces a daily cap |

## A.7 Where the detail lives

| Topic | Location |
| --- | --- |
| Phase-by-phase build plan | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — Part III |
| Full architecture decisions (ADRs) | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — Part II, §17 |
| Data model | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — §18 |
| Design system | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — Part I |

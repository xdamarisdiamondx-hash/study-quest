# Study Quest

> Don't just tell students what they need to study. Help them actually learn it.

Study Quest is a study and task-management app for secondary school and university students
(also useful for independent learners). Instead of being "another place to write notes or
tick off tasks", it guides you through the whole learning journey:

**Plan → Study → Understand → Practice → Quiz → Review → Improve**

The full specification lives in [`Study Quest PRD.docx`](Study%20Quest%20PRD.docx).

---

## Product Vision

Study Quest should make studying feel organized, interactive and rewarding. Opening the app
should immediately answer:

- What do I need to do?
- What should I study?
- What do I need to improve?
- How am I progressing?
- What should I do next?

It should feel like a personal study companion and quest guide, not a normal task manager.

## Target Users

| Primary | Secondary |
| --- | --- |
| Secondary school students | Independent learners |
| University students | Exam candidates, self-taught learners |

## Core Experience

A "Chemistry Exam Quest" walks a student through:

1. Add or write Chemistry notes
2. Read the notes
3. Generate a summary
4. Ask for an explanation of a difficult concept
5. Create flashcards
6. Take a quiz
7. Review incorrect answers
8. Take a short retry quiz
9. Mark the topic complete
10. Earn XP and progress toward the goal

Students choose how much guidance they want: just complete a task, run a focus session, or
follow the full guided journey.

## Main Sections

1. **Home** — progress, today's quest, current goals, recommendations, quick actions
2. **Tasks** — assignments, deadlines, recurring tasks, study tasks
3. **Study** — subjects, topics, notes, summaries, flashcards, explanations, quizzes
4. **Quests** — current, completed and special quests, plus quest progress
5. **Progress** — XP, levels, streaks, achievements, statistics, subject progress

## Feature Highlights

- **Subjects & topics** — `Subject → Topic → Notes / Quizzes / Flashcards / Tasks`
- **Notes** — type or paste, then summarize, explain, quiz, flashcard, read aloud, study
- **AI summaries** — length (quick / standard / detailed) and format (paragraph, bullets,
  key points, exam-style), always grounded in the student's own notes
- **Explain** — simple, step-by-step, example, real-life or "explain like I'm a beginner"
- **Read My Notes** — listen, follow along with highlighting, and pause to ask "Explain this"
- **Quiz generator** — 5/10/15/20 questions, multiple choice / true-false / short answer,
  easy → hard difficulty
- **Quiz results** — score, correct/incorrect, explanations, weak topics
- **Smart retry quizzes** — a smaller quiz built from the questions you got wrong
- **Flashcards** — flip, mark known / needs review, tied to a topic
- **Task manager** — title, subject, topic, deadline, priority, notes, related activity
- **Recurring tasks** — e.g. "Study Mathematics every Monday, Wednesday and Friday"
- **Connected tasks** — suggests a 20-minute review and a short quiz before a task is done
- **Study planning** — manual, suggested or fully automatic schedules
- **Daily Study Quest** — a personalized daily activity list with progress
- **Quest system** — quests as real study goals with steps, plus exam / weekly / subject /
  personal quests
- **Gamification** — XP, levels, streaks, badges, achievements, milestones, quest rewards
- **Progress tracking** — study time, tasks, quests, quiz scores and improvement over time
- **Study sessions** — quick focus, timed focus, or guided (Read → Understand → Practice →
  Quiz → Review)
- **Recommendations** — helpful next steps, never overwhelming
- **Notifications** — deadlines, sessions, quests, revision, streaks, unfinished tasks
- **Search** — across subjects, topics, notes, tasks, quizzes, flashcards and quests

## MVP Scope

**Essential:** home dashboard · subjects and topics · task manager · notes · AI summaries ·
AI explanations · quiz generation with multiple question types and difficulty · quiz results ·
retry quizzes · flashcards · Read My Notes · study sessions · daily quests · XP · levels ·
streaks · basic achievements · progress tracking · study planning.

**Later:** photo notes · PDF/document uploads · advanced achievements · more special quest
types · social features · leaderboards · shared study groups · advanced personalization.

## Product Principles

1. **Learning comes first** — gamification encourages learning, it never distracts from it.
2. **Simple but powerful** — many useful features, never confusing.
3. **Everything connects** — tasks, notes, quizzes, subjects, quests and progress work together.
4. **Students stay in control** — the app recommends, the student decides.
5. **Always answer "What's next?"** — after finishing something, help the student choose what
   to do next.

## Repository Contents

```
Study quest/
├── README.md            # this file
└── Study Quest PRD.docx # product requirements document (v1.0, by Praise)
```

## Status

Early stage — the product requirements are defined and the MVP is scoped. Implementation is
the next step.

## License

To be decided.

import { useState } from "react";
import { Card, Chip, LevelBadge, Monogram, Ring, Track } from "@sq/ui";
import { dayKey } from "@sq/core/gamification";

import { useRewardToast } from "../../lib/rewards";
import {
  useClaimAchievement,
  useGamification,
  type AchievementView,
  type StreakView,
} from "../../lib/useGamification";
import { useProgress } from "../../lib/useProgress";
import { useSubjects } from "../../lib/useSubjects";
import { Heatmap, TrendChart } from "./charts";

const DAY = 86_400_000;

/**
 * Where the streak stands, in the plainest possible words (P15, PRD §22):
 * alive today, still pending today, a freeze covering the gap, or paused —
 * never scolding. The gap is measured on the same UTC days the streak itself
 * counts, so this sentence can't disagree with the number beside it.
 */
function streakNote(streak: StreakView): string {
  if (streak.current === 0) return "Finish a session, quiz or card set to start a streak.";

  const today = dayKey(new Date());
  if (streak.lastActiveDate === today)
    return `Today already counts — you're on a ${streak.current}-day streak.`;

  const gap = streak.lastActiveDate
    ? Math.round(
        (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${streak.lastActiveDate}T00:00:00Z`)) / DAY,
      )
    : Number.POSITIVE_INFINITY;

  if (gap <= 1) return `Study today to keep your ${streak.current}-day streak.`;
  if (gap === 2 && streak.freezeCount > 0)
    return `You're holding ${streak.freezeCount} freeze${streak.freezeCount === 1 ? "" : "s"} — studying today covers yesterday and keeps the streak.`;
  return `Streak paused at ${streak.current} days. Any session today starts it again.`;
}

/** "1h 5m" (or "45m") from minutes — how every duration on this page reads. */
function hm(minutes: number): string {
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

/** "3 sessions" / "1 session" — the counts on this page read like English. */
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** The last `n` days ending today as the streak's own (UTC) day keys. */
function recentDayKeys(n: number): string[] {
  const now = Date.now();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) keys.push(dayKey(new Date(now - i * DAY)));
  return keys;
}

/**
 * The streak calendar: five weeks of day keys from `activeDays` — which is
 * written server-side from `activity_log`, one row per day the streak counted.
 * A cell is inked only by rows the server recorded, so opening the app can
 * never paint a day (the anti-pattern line in PRD §22).
 */
function StreakCalendar({ activeDays }: { activeDays: string[] }) {
  const active = new Set(activeDays);
  const today = dayKey(new Date());
  const keys = recentDayKeys(35);
  const onCount = keys.filter((k) => active.has(k)).length;

  return (
    <>
      <div
        className="sq-cal"
        role="img"
        aria-label={`Study calendar, last five weeks: ${onCount} active day${onCount === 1 ? "" : "s"}`}
      >
        {keys.map((key) => (
          <span
            key={key}
            className="sq-cal-day"
            data-on={active.has(key)}
            data-today={key === today}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="sq-row" style={{ gap: "var(--s4)", marginTop: "var(--s2)" }}>
        <span className="sq-row" style={{ gap: "var(--s2)" }}>
          <span className="sq-cal-day sq-cal-swatch" data-on aria-hidden="true" />
          <span className="sq-label">Studied</span>
        </span>
        <span className="sq-row" style={{ gap: "var(--s2)" }}>
          <span className="sq-cal-day sq-cal-swatch" data-on={false} aria-hidden="true" />
          <span className="sq-label">Quiet</span>
        </span>
        <span className="sq-row" style={{ gap: "var(--s2)" }}>
          <span className="sq-cal-day sq-cal-swatch" data-today aria-hidden="true" />
          <span className="sq-label">Today</span>
        </span>
      </div>
    </>
  );
}

/**
 * Every achievement with its own progress bar. Locked bars show a high-water
 * mark (progress never rewinds when a streak resets); unlocked-unclaimed cards
 * carry the only write on this page — the claim — and the server answers every
 * press from one ledger row keyed by the achievement's code.
 */
function AchievementGrid({ achievements }: { achievements: AchievementView[] }) {
  const claim = useClaimAchievement();
  const reward = useRewardToast();
  const [claimError, setClaimError] = useState<string | null>(null);

  function press(code: string) {
    setClaimError(null);
    claim.mutate(code, {
      onSuccess: (result) => {
        if (result.xp > 0) reward(result.xp, "Achievement claimed");
      },
      onError: () =>
        setClaimError("Couldn't claim that one — the list has been refreshed, try again."),
    });
  }

  return (
    <>
      {claimError && (
        <p className="sq-error" role="alert" style={{ margin: "0 0 var(--s3)" }}>
          {claimError}
        </p>
      )}
      <div className="sq-ach-grid">
        {achievements.map((a) => {
          const pct = a.target > 0 ? Math.min(100, (a.progress / a.target) * 100) : 0;
          return (
            <div
              key={a.code}
              className="sq-ach"
              data-state={a.claimed ? "claimed" : a.unlockedAt ? "unlocked" : "locked"}
            >
              <div className="sq-ach-head">
                <b style={{ font: "var(--t-body)" }}>{a.name}</b>
                <span className="sq-label">+{a.xpReward} XP</span>
              </div>
              <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
                {a.description}
              </p>

              {a.claimed ? (
                <Chip tone="ok">Claimed</Chip>
              ) : a.unlockedAt ? (
                <button
                  type="button"
                  className="sq-btn sq-btn-primary sq-btn-sm"
                  disabled={claim.isPending}
                  onClick={() => press(a.code)}
                >
                  Claim +{a.xpReward} XP
                </button>
              ) : (
                <div className="sq-ach-progress">
                  <span className="sq-ach-bar">
                    <span style={{ width: `${pct}%` }} />
                  </span>
                  <span className="sq-label">
                    {a.progress}/{a.target}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

export function ProgressPage() {
  // Real as of P4: the same `subjectProgress` the Study page shows.
  const { subjects, status } = useSubjects();
  const active = subjects.filter((s) => !s.archived);
  // Real as of P15: level, streak, calendar and achievements in one read.
  const gamification = useGamification();
  // Real as of P16: study time, quiz history and the §24 counts in one read.
  const progress = useProgress();
  const pv = progress.data;

  return (
    <div className="sq-col" style={{ marginTop: "var(--s6)" }}>
      <div>
        <h1
          style={{
            font: "var(--t-h1)",
            margin: "0 0 var(--s1)",
            color: "var(--strong)",
            letterSpacing: "-.025em",
          }}
        >
          Progress
        </h1>
        <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
          Study time, quiz scores, XP, levels and streaks
        </p>
      </div>

      {gamification.isPending ? (
        <Card>
          <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
            Loading your level and streak…
          </p>
        </Card>
      ) : gamification.data ? (
        <Card>
          <div className="sq-row" style={{ flexWrap: "nowrap", gap: "var(--s4)" }}>
            <div style={{ textAlign: "center" }}>
              <LevelBadge level={gamification.data.level.level} />
              <div className="sq-label" style={{ marginTop: 4 }}>
                {gamification.data.level.title}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Track
                label={`XP to level ${gamification.data.level.level + 1}`}
                variant="xp"
                value={gamification.data.level.into}
                max={gamification.data.level.needed}
                caption={`${gamification.data.level.into} / ${gamification.data.level.needed}`}
              />
              <p style={{ margin: "var(--s2) 0 0", color: "var(--muted)", fontSize: 13 }}>
                {gamification.data.totalXp} XP total · {gamification.data.streak.current} day streak
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <Card title="This week">
        {progress.isPending ? (
          <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
            Loading this week's numbers…
          </p>
        ) : pv ? (
          <div className="sq-row" style={{ gap: "var(--s6)", flexWrap: "nowrap" }}>
            <Ring
              value={(pv.study.weekMinutes / pv.study.weekGoal) * 100}
              label={`Weekly study goal: ${pv.study.weekMinutes} of ${pv.study.weekGoal} minutes`}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Track
                label="Study time"
                value={pv.study.weekMinutes}
                max={pv.study.weekGoal}
                caption={`${hm(pv.study.weekMinutes)} of ${hm(pv.study.weekGoal)}`}
              />
              <div style={{ marginTop: "var(--s4)" }}>
                <Track
                  label="Quiz average"
                  value={pv.quiz.weekAverage ?? 0}
                  caption={
                    pv.quiz.weekAverage === null
                      ? "No attempts this week"
                      : `${Math.round(pv.quiz.weekAverage)}% this week`
                  }
                />
              </div>
            </div>
          </div>
        ) : null}
      </Card>

      {pv && (
        <Card title="Study time" action={<span className="sq-label">Last 90 days</span>}>
          <div className="sq-row" style={{ gap: "var(--s2)", marginBottom: "var(--s3)" }}>
            <Chip>Today {hm(pv.study.todayMinutes)}</Chip>
            <Chip>This week {hm(pv.study.weekMinutes)}</Chip>
            <Chip>{plural(pv.study.bySubject.length, "subject")} studied</Chip>
          </div>
          {pv.study.bySubject.length === 0 ? (
            <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
              No sessions yet — start one and its minutes land here.
            </p>
          ) : (
            pv.study.bySubject.map((s) => (
              <div
                key={s.id}
                className="sq-row"
                style={{ padding: "var(--s2) 0", gap: "var(--s3)", flexWrap: "nowrap" }}
              >
                <Monogram text={s.monogram} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Track
                    label={s.name}
                    value={s.minutes}
                    max={pv.study.bySubject[0]?.minutes ?? 1}
                    caption={hm(s.minutes)}
                  />
                </div>
              </div>
            ))
          )}
          <div style={{ marginTop: "var(--s4)" }}>
            <Heatmap
              from={pv.study.window.from}
              to={pv.study.window.to}
              days={pv.study.days}
              label="Study minutes per day, last 90 days"
            />
          </div>
        </Card>
      )}

      {pv && (
        <Card title="Quiz history">
          <div className="sq-row" style={{ gap: "var(--s2)", marginBottom: "var(--s3)" }}>
            <Chip>{plural(pv.quiz.attempts, "attempt")}</Chip>
            <Chip>
              {pv.quiz.average === null
                ? "No scores yet"
                : `${Math.round(pv.quiz.average)}% average`}
            </Chip>
            <Chip>
              {pv.quiz.retries.retried === 0
                ? "No retries yet"
                : `${pv.quiz.retries.improved} of ${pv.quiz.retries.retried} retries improved (avg ${pv.quiz.retries.avgDelta >= 0 ? "+" : ""}${Math.round(pv.quiz.retries.avgDelta)} pp)`}
            </Chip>
          </div>
          <TrendChart
            points={pv.quiz.trend.map((p) => ({ day: p.day, value: p.percent }))}
            label="Quiz scores over time"
            emptyText="No graded quiz attempts yet — the line appears after your first score."
          />
          {pv.quiz.byTopic.length > 0 && (
            <div style={{ marginTop: "var(--s4)" }}>
              <p className="sq-label" style={{ margin: "0 0 var(--s2)" }}>
                By topic
              </p>
              {pv.quiz.byTopic.map((t) => (
                <div
                  key={t.topicId}
                  className="sq-row"
                  style={{ padding: "var(--s2) 0", gap: "var(--s3)", flexWrap: "nowrap" }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Track
                      label={t.topicName}
                      value={t.average ?? 0}
                      caption={
                        t.average === null
                          ? "ungraded"
                          : `${Math.round(t.average)}% · ${plural(t.attempts, "attempt")}`
                      }
                    />
                  </div>
                  <Chip>
                    {t.delta === null
                      ? "first attempt"
                      : `${t.delta > 0 ? "+" : ""}${Math.round(t.delta)} pts`}
                  </Chip>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {pv && (
        <Card title="All time">
          <div className="sq-row" style={{ gap: "var(--s2)", flexWrap: "wrap" }}>
            <Chip>{plural(pv.counts.sessions, "study session")}</Chip>
            <Chip>{plural(pv.counts.tasksCompleted, "task")} done</Chip>
            <Chip>{plural(pv.counts.questsCompleted, "quest")} completed</Chip>
            <Chip>
              {pv.counts.quizzesCompleted} {pv.counts.quizzesCompleted === 1 ? "quiz" : "quizzes"}{" "}
              completed
            </Chip>
            <Chip>{plural(pv.counts.subjectsStudied, "subject")} studied</Chip>
            <Chip>{plural(pv.counts.topicsMastered, "topic")} mastered</Chip>
          </div>
        </Card>
      )}

      {gamification.data && (
        <Card title="Streak">
          <p style={{ margin: "0 0 var(--s3)", font: "var(--t-body)" }}>
            {streakNote(gamification.data.streak)}
          </p>
          <StreakCalendar activeDays={gamification.data.activeDays} />
          <div className="sq-row" style={{ gap: "var(--s2)", marginTop: "var(--s3)" }}>
            <Chip>{plural(gamification.data.streak.current, "day")} now</Chip>
            <Chip>Longest {gamification.data.streak.longest}</Chip>
            <Chip>{gamification.data.streak.freezeCount} freezes held</Chip>
          </div>
        </Card>
      )}

      {gamification.data && (
        <Card
          title="Achievements"
          action={
            <span className="sq-label">
              {gamification.data.achievements.filter((a) => a.claimed).length} of{" "}
              {gamification.data.achievements.length} claimed
            </span>
          }
        >
          <AchievementGrid achievements={gamification.data.achievements} />
        </Card>
      )}

      <Card title="Subjects" action={<span className="sq-label">{active.length} active</span>}>
        {status === "loading" ? (
          <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>Loading…</p>
        ) : active.length === 0 ? (
          <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
            No subjects yet. Add one in Study and it will appear here.
          </p>
        ) : (
          active.map((s) => (
            <div
              key={s.id}
              className="sq-row"
              style={{ padding: "var(--s3) 0", gap: "var(--s3)", flexWrap: "nowrap" }}
            >
              <Monogram text={s.monogram} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Track
                  label={s.name}
                  value={s.progress * 100}
                  caption={`${Math.round(s.progress * 100)}% · ${s.topicCount} topics`}
                />
              </div>
            </div>
          ))
        )}
      </Card>

      <Card>
        <p>
          Every number here is computed from the rows that caused it: subject and topic percentages
          from <code>@sq/core/progress</code> (mastery, reviewed cards, session minutes, quest
          steps), study time from the session log on the streak's own UTC days with weeks starting
          Monday, and quiz scores from graded attempts — charts carry a table of the same data
          underneath. XP, levels, streak days and the achievements are read live from the ledger
          (P15); the calendar inks only days the streak itself counted.
        </p>
      </Card>
    </div>
  );
}

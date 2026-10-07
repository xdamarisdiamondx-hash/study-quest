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
import { useSubjects } from "../../lib/useSubjects";

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
  const totalStudyMinutes = 412;
  const quizAverage = 72;
  // Real as of P4: the same `subjectProgress` the Study page shows.
  const { subjects, status } = useSubjects();
  const active = subjects.filter((s) => !s.archived);
  // Real as of P15: level, streak, calendar and achievements in one read.
  const gamification = useGamification();

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
          XP, levels, streaks and subject progress
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

      {gamification.data && (
        <Card title="Streak">
          <p style={{ margin: "0 0 var(--s3)", font: "var(--t-body)" }}>
            {streakNote(gamification.data.streak)}
          </p>
          <StreakCalendar activeDays={gamification.data.activeDays} />
          <div className="sq-row" style={{ gap: "var(--s2)", marginTop: "var(--s3)" }}>
            <Chip>{gamification.data.streak.current} days now</Chip>
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

      <Card title="This week">
        <div className="sq-row" style={{ gap: "var(--s6)", flexWrap: "nowrap" }}>
          <Ring value={68} label="Weekly study goal, 68 percent" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Track
              label="Study time"
              value={Math.min(100, (totalStudyMinutes / 600) * 100)}
              caption={`${Math.floor(totalStudyMinutes / 60)}h ${totalStudyMinutes % 60}m of 10h`}
            />
            <div style={{ marginTop: "var(--s4)" }}>
              <Track label="Quiz average" value={quizAverage} caption={`${quizAverage}%`} />
            </div>
          </div>
        </div>
      </Card>

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
          Subject percentages come from <code>@sq/core/progress</code> and count real topic state.
          XP, levels, streak days and every achievement above are read live from the ledger (P15) —
          the calendar inks only days the streak itself counted. The study-time and quiz-average
          numbers above stay placeholders until this page aggregates sessions, in P16.
        </p>
      </Card>
    </div>
  );
}

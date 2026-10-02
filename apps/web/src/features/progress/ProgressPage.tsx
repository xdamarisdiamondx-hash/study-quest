import { Card, LevelBadge, Ring, Track } from "@sq/ui";

import { level, profile, subjects } from "../../data/mock";

export function ProgressPage() {
  const totalStudyMinutes = 412;
  const quizAverage = 72;

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

      <Card>
        <div className="sq-row" style={{ flexWrap: "nowrap", gap: "var(--s4)" }}>
          <LevelBadge level={level.level} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Track
              label={`XP to level ${level.level + 1}`}
              variant="xp"
              value={level.into}
              max={level.needed}
              caption={`${level.into} / ${level.needed}`}
            />
            <p style={{ margin: "var(--s2) 0 0", color: "var(--muted)", fontSize: 13 }}>
              {profile.totalXp} XP total · {profile.streakDays} day streak
            </p>
          </div>
        </div>
      </Card>

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

      <Card title="Subjects">
        {subjects.map((s) => (
          <div key={s.id} style={{ padding: "var(--s3) 0" }}>
            <Track label={s.name} value={s.progress} caption={`${s.progress}%`} />
          </div>
        ))}
      </Card>

      <Card>
        <p>
          These percentages are computed by <code>@sq/core/progress</code> from real formulas in the
          architecture doc. Charts and history arrive in P16.
        </p>
      </Card>
    </div>
  );
}

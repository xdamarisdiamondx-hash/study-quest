import { Card, LevelBadge, Monogram, Ring, Track } from "@sq/ui";

import { level, profile } from "../../data/mock";
import { useSubjects } from "../../lib/useSubjects";

export function ProgressPage() {
  const totalStudyMinutes = 412;
  const quizAverage = 72;
  // Subject progress is real as of P4: the same `subjectProgress` the Study page shows.
  const { subjects, status } = useSubjects();
  const active = subjects.filter((s) => !s.archived);

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
          Finished sessions now log real minutes (P14) — read them in the session log under Study
          sessions. The study-time chart above is still a placeholder until this page aggregates
          them, and quiz averages arrive with it, in P16.
        </p>
      </Card>
    </div>
  );
}

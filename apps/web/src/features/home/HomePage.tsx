import { useMemo, useState } from "react";
import { Card, CheckItem, LevelBadge, Monogram, Streak, Track } from "@sq/ui";

import {
  activeQuest,
  continueLearning,
  level,
  profile,
  recommendation,
  subjects,
  todayQuest,
} from "../../data/mock";
import { useHealth } from "../../lib/useHealth";

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function ServiceStatus() {
  const { health, offline } = useHealth();

  if (offline) {
    return (
      <div className="sq-card" style={{ borderColor: "var(--warn-500)" }}>
        <h2>API not reachable</h2>
        <p>
          The app shell is running, but <code>/api/health</code> did not answer. Start the server
          with <code>pnpm dev:all</code>. This is expected until P0's server is started.
        </p>
      </div>
    );
  }
  if (!health) return null;

  return (
    <div className="sq-card">
      <h2>Local services</h2>
      <p>
        API <code>{health.service}</code> v{health.version} · started locally, no hosting.
      </p>
      <div className="sq-col" style={{ marginTop: "var(--s4)", gap: "var(--s2)" }}>
        <Row
          label="Database"
          ok={health.database.reachable}
          note={
            health.database.reachable
              ? "PostgreSQL reachable"
              : (health.database.error ?? "not running — start it with pnpm db:up")
          }
        />
        <Row label="Authentication" ok={false} note="Better Auth — arrives with P3" />
        <Row
          label="AI provider"
          ok={health.ai.configured}
          note={health.ai.configured ? (health.ai.provider ?? "configured") : "none configured — Ollama or a cloud key"}
        />
        <Row
          label="File storage"
          ok={health.storage.configured}
          note={health.storage.configured ? "Cloudflare R2" : "local disk (R2 not configured)"}
        />
      </div>
    </div>
  );
}

function Row({ label, ok, note }: { label: string; ok: boolean; note: string }) {
  return (
    <div className="sq-li">
      <span
        className="sq-check"
        data-done={ok}
        role="img"
        aria-label={ok ? `${label}: ready` : `${label}: not ready`}
      />
      <span className="sq-li-text">
        <strong style={{ fontWeight: 500 }}>{label}</strong>{" "}
        <span style={{ color: "var(--muted)", fontSize: "14px" }}>— {note}</span>
      </span>
    </div>
  );
}

export function HomePage() {
  const [done, setDone] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(todayQuest.map((i) => [i.id, i.done])),
  );

  const completed = useMemo(
    () => todayQuest.filter((i) => done[i.id]).length,
    [done],
  );
  const total = todayQuest.length;
  const todayPct = total === 0 ? 0 : (completed / total) * 100;

  return (
    <div className="sq-col">
      {/* Ambient decoration sits behind the greeting only — never behind data. */}
      <section className="sq-greeting sq-relative" style={{ marginTop: "var(--s6)" }}>
        <div className="sq-ambient" aria-hidden="true" />
        <h1>
          {greeting()}, {profile.displayName}
        </h1>
        <p>
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </section>

      <Card>
        <div className="sq-row" style={{ gap: "var(--s4)", flexWrap: "nowrap" }}>
          <LevelBadge level={level.level} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Track
              label={`XP to level ${level.level + 1}`}
              variant="xp"
              value={level.into}
              max={level.needed}
              caption={`${level.into} / ${level.needed}`}
            />
          </div>
          <div style={{ textAlign: "right" }}>
            <Streak days={profile.streakDays} />
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              {profile.totalXp} XP total
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Today's Quest"
        action={
          <span className="sq-num" style={{ fontSize: 13, color: "var(--muted)" }}>
            {completed}/{total}
          </span>
        }
      >
        <div style={{ marginBottom: "var(--s2)" }}>
          <Track label="Today's progress" value={todayPct} />
        </div>
        {todayQuest.map((item) => (
          <CheckItem
            key={item.id}
            done={Boolean(done[item.id])}
            onToggle={() => setDone((d) => ({ ...d, [item.id]: !d[item.id] }))}
          >
            {item.title}{" "}
            <span style={{ color: "var(--muted)", fontSize: "14px" }}>
              · {item.subject} · {item.minutes} min
            </span>
          </CheckItem>
        ))}
      </Card>

      <Card title="Continue learning">
        <div className="sq-row" style={{ flexWrap: "nowrap", gap: "var(--s3)" }}>
          <Monogram text={continueLearning.monogram} active />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500 }}>{continueLearning.topic}</div>
            <div style={{ color: "var(--muted)", fontSize: 14 }}>
              Biology · {continueLearning.minutesAgo} min ago
            </div>
          </div>
          <button type="button" className="sq-btn sq-btn-primary sq-btn-sm">
            Resume
          </button>
        </div>
      </Card>

      <Card title="What's next">
        <div className="sq-callout sq-callout-accent">
          {recommendation.text}
        </div>
        <div className="sq-row" style={{ marginTop: "var(--s4)" }}>
          <button type="button" className="sq-btn sq-btn-primary">
            {recommendation.cta}
          </button>
          <button type="button" className="sq-btn sq-btn-ghost">
            Not now
          </button>
        </div>
      </Card>

      <ServiceStatus />

      <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 var(--s4)" }}>
        Milestone 0 vertical slice. Content is placeholder data until subjects (P4) and notes (P5)
        are built — see <code>docs/PHASES.md</code>.
      </p>
    </div>
  );
}

import { Link } from "react-router-dom";
import {
  Card,
  CheckItem,
  EmptyState,
  IconButton,
  LevelBadge,
  Monogram,
  Streak,
  Track,
} from "@sq/ui";
import { groupQuest, localDate, type QuestItem } from "@sq/core/planning";

import { recommendation } from "../../data/mock";
import { DueReviewCard } from "../flashcards/DueReviewCard";
import { useAuth } from "../../lib/useAuth";
import { useGamification } from "../../lib/useGamification";
import { useHealth } from "../../lib/useHealth";
import { usePlanActions, usePlanDay } from "../../lib/usePlan";
import { useSubjects } from "../../lib/useSubjects";

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
          The app shell is running, but <code>/api/health</code> did not answer. Start the database
          and server with <code>pnpm db:up</code> and <code>pnpm dev:all</code>.
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
        <Row label="Authentication" ok note="Better Auth — email and password" />
        <Row
          label="AI provider"
          ok={health.ai.configured}
          note={
            health.ai.configured
              ? (health.ai.provider ?? "configured")
              : "none configured — Ollama or a cloud key"
          }
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

/**
 * Where to pick up.
 *
 * Subjects and topics are real as of P4, so this shows the first subject that actually has
 * topics. It cannot yet be "the last thing you studied" — `topics.lastStudiedAt` stays null
 * until sessions exist in P14 — and the copy says so rather than inventing a timestamp.
 */
function ContinueLearning() {
  const { subjects, status } = useSubjects();
  const next = subjects.find((s) => !s.archived && s.topicCount > 0);

  if (status === "loading") return null;

  if (!next) {
    return (
      <Card title="Continue learning">
        <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
          Add a subject with at least one topic and it will show up here.
        </p>
        <Link to="/study" className="sq-btn sq-btn-secondary sq-btn-sm">
          Go to Study
        </Link>
      </Card>
    );
  }

  return (
    <Card title="Continue learning">
      <div className="sq-row" style={{ flexWrap: "nowrap", gap: "var(--s3)" }}>
        <Monogram text={next.monogram} active />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500 }}>{next.name}</div>
          <div style={{ color: "var(--muted)", fontSize: 14 }}>
            {next.topicCount} topic{next.topicCount === 1 ? "" : "s"} ·{" "}
            {Math.round(next.progress * 100)}% complete
          </div>
        </div>
        <Link to={`/study/${next.id}`} className="sq-btn sq-btn-primary sq-btn-sm">
          Open
        </Link>
      </div>
    </Card>
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

/**
 * Today's Quest (P12): the day's plan grouped by subject — the same rows the Plan
 * page edits, so the two can never disagree (A.8). Toggling a task-kind item goes
 * through the shared completion service: the task closes with it, and its XP lands
 * exactly once.
 */
function TodaysQuest() {
  const date = localDate(new Date());
  const day = usePlanDay(date);
  const actions = usePlanActions();

  const blocks = day.data?.blocks ?? [];
  const items: QuestItem[] = blocks.map((b) => ({
    blockId: b.id,
    title: b.title,
    kind: b.kind,
    subjectId: b.subjectId,
    subjectName: b.subjectName,
    minutes: b.plannedMin,
    done: b.status === "done",
  }));
  const groups = groupQuest(items);
  const completed = items.filter((i) => i.done).length;
  const total = items.length;
  const todayPct = total === 0 ? 0 : (completed / total) * 100;
  const busy = actions.patch.isPending || actions.generate.isPending;

  if (day.isPending) {
    return (
      <Card title="Today's Quest">
        <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>Loading…</p>
      </Card>
    );
  }
  if (!day.data) return null; // An unreachable API is already explained by ServiceStatus.

  const manual = day.data.plan.mode === "manual";

  return (
    <Card
      title="Today's Quest"
      action={
        <span className="sq-row" style={{ gap: "var(--s3)", alignItems: "center" }}>
          <span className="sq-num" style={{ fontSize: 13, color: "var(--muted)" }}>
            {completed}/{total}
          </span>
          {manual ? null : (
            <IconButton
              title="Regenerate the day — keeps what you've finished"
              aria-label="Regenerate today's plan"
              disabled={busy}
              onClick={() => actions.generate.mutate({ date })}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 12a8 8 0 1 1-2.3-5.6" />
                <path d="M20 4v4h-4" />
              </svg>
            </IconButton>
          )}
        </span>
      }
    >
      {total === 0 ? (
        <EmptyState
          title="Nothing planned yet"
          hint="The Plan page turns your deadlines into a day you can actually finish."
          action={
            <Link to="/plan" className="sq-btn sq-btn-primary sq-btn-sm">
              Open the Plan
            </Link>
          }
        />
      ) : (
        <>
          <div style={{ marginBottom: "var(--s2)" }}>
            <Track label="Today's progress" value={todayPct} caption={`${completed}/${total}`} />
          </div>
          {groups.map((group) => (
            <div key={group.subjectId ?? "none"} style={{ marginTop: "var(--s3)" }}>
              <span className="sq-label" style={{ display: "block", marginBottom: 2 }}>
                {group.subjectName}
              </span>
              {group.items.map((item) => (
                <CheckItem
                  key={item.blockId}
                  done={item.done}
                  onToggle={() =>
                    actions.patch.mutate({
                      id: item.blockId,
                      patch: { status: item.done ? "pending" : "done" },
                    })
                  }
                >
                  {item.title}{" "}
                  <span style={{ color: "var(--muted)", fontSize: "14px" }}>
                    · {item.minutes} min
                  </span>
                </CheckItem>
              ))}
            </div>
          ))}
        </>
      )}
    </Card>
  );
}

/**
 * Level, XP and streak — the account's own numbers since P15, summed from the
 * ledger on the server. While the first read is in flight the card holds its
 * shape with a loading line; a failed one leaves the card out entirely, because
 * ServiceStatus above already explains an unreachable API better than a zero
 * ever could ("0 XP" would be a lie, not a fallback).
 */
function LevelStrip() {
  const { data, isPending } = useGamification();

  if (isPending) {
    return (
      <Card>
        <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
          Loading your level and streak…
        </p>
      </Card>
    );
  }
  if (!data) return null;

  return (
    <Card>
      <div className="sq-row" style={{ gap: "var(--s4)", flexWrap: "nowrap" }}>
        <LevelBadge level={data.level.level} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Track
            label={`XP to level ${data.level.level + 1}`}
            variant="xp"
            value={data.level.into}
            max={data.level.needed}
            caption={`${data.level.into} / ${data.level.needed}`}
          />
        </div>
        <div style={{ textAlign: "right" }}>
          <Streak days={data.streak.current} />
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            {data.totalXp} XP total
          </div>
        </div>
      </div>
    </Card>
  );
}

export function HomePage() {
  // The account's real name — never the mock profile's placeholder.
  const { profile: account } = useAuth();

  return (
    <div className="sq-col">
      {/* Ambient decoration sits behind the greeting only — never behind data. */}
      <section className="sq-greeting sq-relative" style={{ marginTop: "var(--s6)" }}>
        <div className="sq-ambient" aria-hidden="true" />
        <h1>{account?.displayName ? `${greeting()}, ${account.displayName}` : greeting()}</h1>
        <p>
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
        {/* PRD §6's home CTA: one click from greeting to the clock (P14). */}
        <Link to="/sessions" className="sq-btn sq-btn-primary" style={{ marginTop: "var(--s3)" }}>
          Start study session
        </Link>
      </section>

      <LevelStrip />

      <DueReviewCard />

      <TodaysQuest />

      <ContinueLearning />

      <Card title="What's next">
        <div className="sq-callout sq-callout-accent">{recommendation.text}</div>
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
        Today's Quest reads your real plan (P12); XP, level and streak above are read from the
        ledger as of P15 — they move the moment you earn them. Subjects, topics and subject progress
        have been real since P4. See <code>docs/PHASES.md</code>.
      </p>
    </div>
  );
}

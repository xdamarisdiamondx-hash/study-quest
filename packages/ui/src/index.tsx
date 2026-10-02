/**
 * Study Quest design system — React components.
 *
 * Styling lives in `packages/ui/src/styles/*.css` as classes, so the app consumes
 * the system without a styling runtime. Source: docs/IMPLEMENTATION_PLAN.md Part I.
 */
import type { ReactNode } from "react";

/* --- brand ------------------------------------------------------------- */

/** The logo. `brand/logo-mark.svg` is the only mark; derivatives are technical only. */
export function Logo({ size = 32, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id="sq-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#A78BFA" />
          <stop offset="0.5" stopColor="#7C3AED" />
          <stop offset="1" stopColor="#4C1D95" />
        </linearGradient>
        <linearGradient id="sq-star" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#FDE68A" />
          <stop offset="1" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill="url(#sq-logo)" />
      <g transform="translate(0 40)">
        <path
          d="M256 82c9.6 38.4 9.6 38.4 48 48-38.4 9.6-38.4 9.6-48 48-9.6-38.4-9.6-38.4-48-48 38.4-9.6 38.4-9.6 48-48z"
          fill="url(#sq-star)"
        />
        <path d="M256 200c-40-28-96-36-144-28v158c48-8 104 0 144 26z" fill="#fff" />
        <path d="M256 200c40-28 96-36 144-28v158c-48-8-104 0-144 26z" fill="#fff" />
      </g>
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="sq-wordmark">
      <Logo size={26} />
      <b>Study Quest</b>
    </span>
  );
}

/* --- surfaces ----------------------------------------------------------- */

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`sq-card ${className}`}>
      {(title || action) && (
        <header className="sq-card-head">
          {title ? <h2>{title}</h2> : <span />}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function EmptyState({
  monogram,
  title,
  hint,
  action,
}: {
  monogram?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="sq-empty">
      <div className={`sq-mono sq-mono-lg ${monogram ? "" : "sq-mono-active"}`} style={{ margin: "0 auto" }}>
        {monogram ?? "+"}
      </div>
      <b>{title}</b>
      {hint ? <small>{hint}</small> : null}
      {action ? <div style={{ marginTop: "var(--s5)" }}>{action}</div> : null}
    </div>
  );
}

/* --- progress ----------------------------------------------------------- */

export function Ring({
  value,
  label,
  small = false,
}: {
  value: number;
  label: string;
  small?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={`sq-ring ${small ? "sq-ring-sm" : ""}`}
      style={{ "--pct": pct } as React.CSSProperties}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <span>{pct}%</span>
    </div>
  );
}

export function Track({
  value,
  max = 100,
  variant,
  label,
  caption,
}: {
  value: number;
  max?: number;
  variant?: "xp";
  label: string;
  caption?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div>
      <div className="sq-track-meta">
        <span>{label}</span>
        {caption ? <span className="sq-num">{caption}</span> : null}
      </div>
      <div
        className={`sq-track ${variant === "xp" ? "sq-track-xp" : ""}`}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* --- identity ----------------------------------------------------------- */

type ChipTone = "neutral" | "accent" | "iris" | "gold" | "ok" | "warn" | "bad";

export function Chip({ tone = "neutral", children }: { tone?: ChipTone; children: ReactNode }) {
  const cls = tone === "neutral" ? "sq-chip" : `sq-chip sq-chip-${tone}`;
  return <span className={cls}>{children}</span>;
}

/** Subjects are identified by monogram, never by colour (design system section 3.5). */
export function Monogram({
  text,
  active = false,
  large = false,
}: {
  text: string;
  active?: boolean;
  large?: boolean;
}) {
  const cls = ["sq-mono", large ? "sq-mono-lg" : "", active ? "sq-mono-active" : ""].filter(Boolean).join(" ");
  return <span className={cls}>{text}</span>;
}

export function LevelBadge({ level }: { level: number }) {
  return (
    <span className="sq-lvl">
      <span className="sq-lvl-badge">{level}</span>
      <span>
        <span className="sq-lvl-name">{LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1]}</span>
        <br />
        <span className="sq-lvl-sub">Level {level}</span>
      </span>
    </span>
  );
}

export function Streak({ days }: { days: number }) {
  return (
    <span className="sq-streak" title={`${days} day streak`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2c.6 3.2-1.4 4.6-2.8 6.2C7.6 10 6 11.7 6 14.4A6 6 0 0 0 18 14c0-3.9-2.4-6.2-6-12z" />
      </svg>
      <span>{days} day streak</span>
    </span>
  );
}

/* --- lists -------------------------------------------------------------- */

export function CheckItem({
  done,
  onToggle,
  children,
}: {
  done: boolean;
  onToggle?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sq-li" data-done={done}>
      <button
        type="button"
        className="sq-check"
        data-done={done}
        aria-pressed={done}
        aria-label={done ? "Mark as not done" : "Mark as done"}
        onClick={onToggle}
      />
      <span className="sq-li-text">{children}</span>
    </div>
  );
}

export type StepState = "done" | "current" | "todo" | "locked";

export function QuestStepper({ steps }: { steps: { id: string; title: string; state: StepState }[] }) {
  return (
    <ol className="sq-steps" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {steps.map((s, i) => (
        <li key={s.id} className="sq-step" data-state={s.state}>
          <span className="sq-step-box" aria-hidden="true">
            {s.state === "done" ? "✓" : s.state === "locked" ? "·" : i + 1}
          </span>
          <span>{s.title}</span>
        </li>
      ))}
    </ol>
  );
}

/* --- level titles (shared with @sq/core) --------------------------------- */
const LEVEL_TITLES = [
  "Newcomer",
  "Explorer",
  "Apprentice",
  "Scholar",
  "Adept",
  "Strategist",
  "Champion",
  "Master",
] as const;

export { LEVEL_TITLES };

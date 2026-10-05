/**
 * Study Quest design system — React components.
 *
 * Styling lives in `packages/ui/src/styles/*.css` as classes, so the app consumes
 * the system without a styling runtime. Source: docs/IMPLEMENTATION_PLAN.md Part I.
 */
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

import { LEVEL_TITLES, levelTitle } from "@sq/core/gamification";

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
      {/* Gradient stops use design tokens, so the mark follows the theme.
          See design system section 3.1. */}
      <defs>
        <linearGradient id="sq-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--iris-400)" />
          <stop offset="0.5" stopColor="var(--iris-600)" />
          <stop offset="1" stopColor="var(--iris-900)" />
        </linearGradient>
        <linearGradient id="sq-star" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="var(--gold-200)" />
          <stop offset="1" stopColor="var(--gold-500)" />
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
  style,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section className={`sq-card ${className}`} style={style}>
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
      <div
        className={`sq-mono sq-mono-lg ${monogram ? "" : "sq-mono-active"}`}
        style={{ margin: "0 auto" }}
      >
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
      style={{ "--pct": pct } as CSSProperties}
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
  const cls = ["sq-mono", large ? "sq-mono-lg" : "", active ? "sq-mono-active" : ""]
    .filter(Boolean)
    .join(" ");
  return <span className={cls}>{text}</span>;
}

export function LevelBadge({ level }: { level: number }) {
  return (
    <span className="sq-lvl">
      <span className="sq-lvl-badge">{level}</span>
      <span>
        <span className="sq-lvl-name">
          {/* Titles come from @sq/core so the badge and the XP rules cannot disagree. */}
          {levelTitle(level)}
        </span>
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

export function QuestStepper({
  steps,
}: {
  steps: { id: string; title: string; state: StepState }[];
}) {
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

/* --- navigation within a page ------------------------------------------- */

export interface TabItem {
  id: string;
  label: string;
  /** Optional count badge, e.g. topics in a subject. */
  count?: number;
  /** A tab that is not built yet says so instead of pretending. */
  soon?: boolean;
}

/**
 * Segmented tabs for in-page navigation (section 9, "tabs / navigation").
 *
 * Roving tabindex: only the selected tab is in the tab order, and arrow keys move between
 * them, which is what the ARIA tabs pattern expects.
 */
export function Tabs({
  items,
  active,
  onChange,
  label,
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  label: string;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const index = items.findIndex((i) => i.id === active);
    const next = items[(index + delta + items.length) % items.length];
    if (next) onChange(next.id);
  }

  return (
    <div className="sq-seg" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            className="sq-seg-btn"
            data-on={selected}
            onClick={() => onChange(item.id)}
          >
            {item.label}
            {item.count !== undefined ? <span className="sq-seg-n">{item.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  active,
  children,
}: {
  id: string;
  active: string;
  children: ReactNode;
}) {
  if (id !== active) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0}>
      {children}
    </div>
  );
}

/* --- reordering --------------------------------------------------------- */

/**
 * Keyboard reordering (section 6: "drag or keyboard").
 *
 * Pointer dragging is handled by the list itself; these buttons are the reachable
 * equivalent, so reordering never depends on being able to drag precisely.
 */
export function ReorderButtons({
  index,
  total,
  onMove,
  label,
}: {
  index: number;
  total: number;
  onMove: (from: number, to: number) => void;
  label: string;
}) {
  return (
    <span className="sq-reorder">
      <button
        type="button"
        className="sq-icon-btn"
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
        aria-label={`Move ${label} up`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 15 6-6 6 6" />
        </svg>
      </button>
      <button
        type="button"
        className="sq-icon-btn"
        disabled={index === total - 1}
        onClick={() => onMove(index, index + 1)}
        aria-label={`Move ${label} down`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </span>
  );
}

/** The drag affordance. Hidden from assistive tech: ReorderButtons is the keyboard path. */
export function DragHandle({ label }: { label: string }) {
  return (
    <span className="sq-drag" aria-hidden="true" title={`Drag to reorder ${label}`}>
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="none"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="9" cy="6" r="1.6" />
        <circle cx="15" cy="6" r="1.6" />
        <circle cx="9" cy="12" r="1.6" />
        <circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="18" r="1.6" />
        <circle cx="15" cy="18" r="1.6" />
      </svg>
    </span>
  );
}

/* --- pickers ------------------------------------------------------------ */

export interface PickerOption {
  value: string;
  label: string;
  /** Rendered before the label — a monogram for subjects. */
  prefix?: string;
}

/**
 * A labelled select. Used for the subject/topic picker that tasks, notes and sessions all
 * share, so the choice of vocabulary is made once.
 */
export function Picker({
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled,
  hint,
}: {
  label: string;
  value: string | null;
  options: PickerOption[];
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="sq-field">
      <label htmlFor={`picker-${label.replace(/\W+/g, "-").toLowerCase()}`}>{label}</label>
      <select
        id={`picker-${label.replace(/\W+/g, "-").toLowerCase()}`}
        className="sq-select"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.prefix ? `${o.prefix} — ` : ""}
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <p className="sq-help">{hint}</p> : null}
    </div>
  );
}

/* --- toolbar (P5) ------------------------------------------------------ */

/** A toolbar row with groups and separators. */
export function Toolbar({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={`sq-toolbar ${className ?? ""}`} style={style} role="toolbar">{children}</div>;
}

/** A group of toolbar buttons. */
export function ToolbarGroup({ children }: { children: ReactNode }) {
  return <div className="sq-toolbar-group">{children}</div>;
}

/** A vertical separator in a toolbar. */
export function ToolbarSeparator() {
  return <div className="sq-toolbar-sep" role="separator" />;
}

/** A button inside a toolbar. */
export function ToolbarButton({
  children,
  onClick,
  pressed,
  disabled,
  title,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  pressed?: boolean;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      className={`sq-icon-btn ${pressed ? "sq-pressed" : ""} ${disabled ? "sq-disabled" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={pressed}
    >
      {children}
    </button>
  );
}

/** A standard button. */
export function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled,
  type = "button",
  className,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type={type}
      className={`sq-btn sq-btn-${variant} sq-btn-${size} ${className ?? ""}`}
      onClick={onClick}
      disabled={disabled}
      style={style}
    >
      {children}
    </button>
  );
}

/** An icon-only button. */
export function IconButton({
  children,
  onClick,
  disabled,
  title,
  "aria-label": ariaLabel,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`sq-icon-btn ${className ?? ""}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

/** A text input field. */
export function Input({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  style,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { className?: string; style?: CSSProperties }) {
  return (
    <input
      className={`sq-input ${className ?? ""}`}
      value={value}
      onChange={(e) => onChange?.(e)}
      placeholder={placeholder}
      disabled={disabled}
      style={style}
      {...props}
    />
  );
}

/** A modal dialog. */
export function Dialog({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}) {
  if (!open) return null;
  return (
    <div className="sq-dialog-backdrop" onClick={onClose}>
      <div className="sq-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby={title ? "dialog-title" : undefined}>
        {title && <h3 id="dialog-title" style={{ margin: "0 0 var(--s3)" }}>{title}</h3>}
        {children}
      </div>
    </div>
  );
}

export { LEVEL_TITLES };

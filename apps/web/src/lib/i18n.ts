/**
 * i18n scaffolding (P21): one place that decides how this app speaks.
 *
 * Two jobs:
 *
 * 1. **Date and number formatting, centralised.** Every call site used to
 *    spell its own `toLocaleDateString(undefined, {...})` — `undefined`
 *    meaning "whatever the machine says", so two screens could disagree and
 *    no single knob could change the format. All of them now go through the
 *    helpers below, which read `LOCALE` (the first locale is `en`).
 *
 * 2. **A string catalogue with `t()`.** Extracted strings are keyed, not
 *    embedded, so a second locale is a new object, not a code change. The
 *    extraction starts where it earns the most — the shell's navigation and
 *    loading states — and grows screen by screen (A.8: scaffolding now,
 *    migration opportunistically; `en` is the only locale, so mixed extraction
 *    can never show a student a key).
 */

/** The one locale this build ships. Future locales extend this union. */
export const LOCALE = "en";

function toDate(value: string | Date): Date {
  return typeof value === "string" ? new Date(value) : value;
}

/** "Oct 8" — rows, cards, compact lists. */
export function formatMonthDay(value: string | Date): string {
  return toDate(value).toLocaleDateString(LOCALE, { month: "short", day: "numeric" });
}

/** "Thursday, October 8" — the day's headline on Home and Plan. */
export function formatLongDate(value: string | Date): string {
  return toDate(value).toLocaleDateString(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** "14:05" as the locale spells it (2-digit hour and minute). */
export function formatTime(value: string | Date): string {
  return toDate(value).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
}

/** "Oct 8, 14:05" — one stamp for history rows. */
export function formatStamp(value: string | Date): string {
  return toDate(value).toLocaleString(LOCALE, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The locale's default date — for places with no house style of their own. */
export function formatDate(value: string | Date): string {
  return toDate(value).toLocaleDateString(LOCALE);
}

/** Grouped, locale-aware numbers ("1,234"). */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(LOCALE, options);
}

/* --- strings ------------------------------------------------------------ */

export const en = {
  "nav.home": "Home",
  "nav.plan": "Plan",
  "nav.tasks": "Tasks",
  "nav.study": "Study",
  "nav.quests": "Quests",
  "nav.progress": "Progress",
  "state.loading": "Loading…",
  "state.error.title": "Something went wrong",
} as const;

export type StringKey = keyof typeof en;

/** Every locale's catalogue; a second locale is one more entry here. */
const catalogues = { en } satisfies Record<string, typeof en>;

/**
 * Look a string up in the active locale, interpolating `{vars}`.
 *
 * Missing keys fall back to the key itself rather than throwing: a typo in a
 * translation should be visible in one place, not a crash in production.
 */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  const strings = catalogues[LOCALE as keyof typeof catalogues] ?? catalogues.en;
  const template: string = strings[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

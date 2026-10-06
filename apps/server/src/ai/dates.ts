/**
 * Calendar boundaries behind the cost guardrails (P6, ADR-025).
 *
 * Deliberately free of any database import: `usage.ts` reaches into `ai_artifacts`, and a
 * module like this one has to stay importable by a test that must not open the data
 * directory the dev server already holds. The bug that separation exists to make visible
 * used to live here — reading the *time* parts as well as the date parts rebuilt "now"
 * instead of midnight, so the daily cap counted nothing and Settings read "0 of 40" with
 * generations listed directly beneath it.
 *
 * "Today" is the account's day (`users.timezone`, which every profile currently sets to
 * UTC), not the machine's, so the same request is the same count wherever it is run from.
 */

interface YearMonthDay {
  year: number;
  month: number;
  day: number;
}

function ymdOf(at: Date, timezone: string): YearMonthDay {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** The UTC offset, in milliseconds, that `timezone` had at `instant`. */
function zoneOffsetMs(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wallClock = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  // Whole seconds on both sides, so the result is the zone's offset and not the clock's
  // leftover milliseconds.
  return wallClock - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which `timezone`'s clock reads 00:00 on the given date.
 *
 * Looked up twice: the offset an instant from now can differ from the offset at midnight
 * when a daylight-saving change sits between them, so the first answer is used to find the
 * second. `UTC` needs no second guess — its offset is always zero.
 */
function midnightOn(date: YearMonthDay, timezone: string): Date {
  const wallMidnight = Date.UTC(date.year, date.month - 1, date.day);
  const guess = wallMidnight - zoneOffsetMs(new Date(wallMidnight), timezone);
  return new Date(wallMidnight - zoneOffsetMs(new Date(guess), timezone));
}

/** Midnight today in the account's timezone, so "today" means the student's today. */
export function startOfDay(timezone = "UTC"): Date {
  return midnightOn(ymdOf(new Date(), timezone), timezone);
}

/** Midnight on the first of this month in the account's timezone. */
export function startOfMonth(timezone = "UTC"): Date {
  const today = ymdOf(new Date(), timezone);
  return midnightOn({ year: today.year, month: today.month, day: 1 }, timezone);
}

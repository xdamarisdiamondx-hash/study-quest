/**
 * Calendar boundary tests (P6, ADR-025).
 *
 * These guard the daily cap. The original `startOfDay` read the *time* parts of the date as
 * well as the date parts, so it rebuilt "now" instead of midnight — the cap then counted only
 * what had happened in the last few hours (on a UTC machine, nothing at all), and Settings
 * read "0 of 40" with generations listed right below it. Every assertion here fails on that
 * version.
 */
import { describe, expect, it } from "vitest";

import { startOfDay, startOfMonth } from "./dates.ts";

const ZONES = ["UTC", "Europe/London", "Asia/Tokyo", "America/New_York"] as const;

/** What a clock in `timezone` reads at `instant`, as "YYYY-MM-DD HH:MM". */
function clockIn(at: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "?";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

describe("startOfDay", () => {
  it("reads 00:00 in the timezone it was asked about", () => {
    for (const zone of ZONES) {
      expect(clockIn(startOfDay(zone), zone).slice(11), zone).toBe("00:00");
    }
  });

  it("is midnight rather than the current instant", () => {
    const utc = startOfDay("UTC");
    expect([
      utc.getUTCHours(),
      utc.getUTCMinutes(),
      utc.getUTCSeconds(),
      utc.getUTCMilliseconds(),
    ]).toEqual([0, 0, 0, 0]);
  });

  it("is today's date there — not yesterday's, and not tomorrow's", () => {
    for (const zone of ZONES) {
      expect(clockIn(startOfDay(zone), zone).slice(0, 10), zone).toBe(
        clockIn(new Date(), zone).slice(0, 10),
      );
    }
  });

  it("never lies in the future, so a fresh count cannot start empty", () => {
    const now = Date.now();
    for (const zone of ZONES) {
      expect(startOfDay(zone).getTime(), zone).toBeLessThanOrEqual(now);
    }
  });

  it("is at most a day behind now", () => {
    const now = Date.now();
    for (const zone of ZONES) {
      expect(now - startOfDay(zone).getTime(), zone).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    }
  });

  it("defaults to the account timezone, which every profile sets to UTC", () => {
    expect(startOfDay().getTime()).toBe(startOfDay("UTC").getTime());
  });
});

describe("startOfMonth", () => {
  it("is the first of the month at 00:00", () => {
    for (const zone of ZONES) {
      const at = startOfMonth(zone);
      expect(clockIn(at, zone), zone).toBe(`${clockIn(at, zone).slice(0, 7)}-01 00:00`);
    }
  });

  it("is the current month there and never in the future", () => {
    const now = Date.now();
    for (const zone of ZONES) {
      expect(clockIn(startOfMonth(zone), zone).slice(0, 7), zone).toBe(
        clockIn(new Date(), zone).slice(0, 7),
      );
      expect(startOfMonth(zone).getTime(), zone).toBeLessThanOrEqual(now);
    }
  });

  it("defaults to the account timezone", () => {
    expect(startOfMonth().getTime()).toBe(startOfMonth("UTC").getTime());
  });
});

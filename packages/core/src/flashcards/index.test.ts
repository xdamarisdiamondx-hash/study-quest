import { describe, expect, it } from "vitest";

import {
  isDue,
  isHard,
  MIN_EASE,
  parseImport,
  RATING_LABEL,
  schedule,
  toTsv,
  type CardState,
} from "./index.ts";

const NOW = new Date("2026-10-06T09:00:00.000Z");
const DAY = 86_400_000;

/** A card that has never been seen — the column defaults of the flashcards table. */
const fresh: CardState = { ease: 2.5, intervalDays: 0, repetitions: 0, lapses: 0 };

const seen = (over: Partial<CardState> = {}): CardState => ({
  ease: 2.5,
  intervalDays: 6,
  repetitions: 2,
  lapses: 0,
  ...over,
});

describe("ratings", () => {
  it("maps every stored rating to the label the buttons show", () => {
    expect(RATING_LABEL).toEqual({ again: "Review", hard: "Hard", good: "Know", easy: "Easy" });
  });
});

describe("schedule", () => {
  it("opens 1 → 6 → ease-compounded, the classic SM-2 ladder", () => {
    const first = schedule(fresh, "good", NOW);
    expect(first).toEqual({
      ease: 2.5,
      intervalDays: 1,
      repetitions: 1,
      lapses: 0,
      dueAt: new Date(NOW.getTime() + DAY),
      lastReviewedAt: NOW,
    });

    const second = schedule({ ...fresh, ...first }, "good", NOW);
    expect(second.intervalDays).toBe(6);
    expect(second.repetitions).toBe(2);

    const third = schedule({ ...fresh, ...second }, "good", NOW);
    expect(third.intervalDays).toBe(Math.round(6 * 2.5)); // 15
    expect(third.dueAt).toEqual(new Date(NOW.getTime() + 15 * DAY));
  });

  it("easy raises ease and hard lowers it, symmetrically", () => {
    expect(schedule(seen(), "easy", NOW).ease).toBeCloseTo(2.65);
    expect(schedule(seen(), "hard", NOW).ease).toBeCloseTo(2.35);
    expect(schedule(seen(), "good", NOW).ease).toBe(2.5);
  });

  it("never lets ease fall below the SM-2 floor", () => {
    const worn = seen({ ease: MIN_EASE, intervalDays: 30, repetitions: 6 });
    expect(schedule(worn, "hard", NOW).ease).toBe(MIN_EASE);
    expect(schedule(worn, "again", NOW).ease).toBe(MIN_EASE);
  });

  it("a miss lapses the card and makes it due immediately", () => {
    const state = schedule(seen(), "again", NOW);
    expect(state).toEqual({
      ease: 2.3,
      intervalDays: 0,
      repetitions: 0,
      lapses: 1,
      dueAt: NOW,
      lastReviewedAt: NOW,
    });
  });

  it("relearning after a miss starts the ladder again at one day", () => {
    const missed = schedule(seen(), "again", NOW);
    const relearned = schedule({ ...fresh, ...missed }, "good", NOW);
    expect(relearned.repetitions).toBe(1);
    expect(relearned.intervalDays).toBe(1);
    expect(relearned.lapses).toBe(1); // the miss still counts as history
  });

  it("a grown interval never advances by less than a day", () => {
    const awkward = seen({ ease: MIN_EASE, intervalDays: 2, repetitions: 3 });
    const next = schedule(awkward, "good", NOW);
    expect(next.intervalDays).toBe(3); // round(2 × 1.3) = 3, and at least prev + 1
  });

  it("does not alias the clock it was handed", () => {
    const state = schedule(fresh, "again", NOW);
    expect(state.dueAt).not.toBe(NOW);
    expect(state.lastReviewedAt).not.toBe(NOW);
  });
});

describe("isDue", () => {
  it("treats a never-reviewed card as due from the start", () => {
    expect(isDue({ dueAt: null }, NOW)).toBe(true);
  });

  it("counts overdue and due-now, not future", () => {
    expect(isDue({ dueAt: new Date(NOW.getTime() - DAY) }, NOW)).toBe(true);
    expect(isDue({ dueAt: NOW }, NOW)).toBe(true);
    expect(isDue({ dueAt: new Date(NOW.getTime() + DAY) }, NOW)).toBe(false);
  });

  it("reads the ISO strings the API hands the client", () => {
    expect(isDue({ dueAt: NOW.toISOString() }, NOW)).toBe(true);
    expect(isDue({ dueAt: new Date(NOW.getTime() + DAY).toISOString() }, NOW)).toBe(false);
  });
});

describe("isHard", () => {
  it("is about misses, not ease", () => {
    expect(isHard({ lapses: 0 })).toBe(false);
    expect(isHard({ lapses: 1 })).toBe(true);
  });
});

describe("import and export", () => {
  const cards = [
    {
      front: "What is photosynthesis?",
      back: "The process by which plants use light energy to produce food.",
    },
    { front: "State Newton's third law", back: "Every action has an equal and opposite reaction." },
  ];

  it("exports one tab-separated line per card", () => {
    expect(toTsv(cards)).toBe(
      "What is photosynthesis?\tThe process by which plants use light energy to produce food.\n" +
        "State Newton's third law\tEvery action has an equal and opposite reaction.",
    );
  });

  it("flattens separators inside the text so the file stays two columns", () => {
    const [line] = toTsv([{ front: "a\tb", back: "c\nd" }]).split("\n");
    expect(line).toBe("a b\tc d");
    expect(parseImport(toTsv([{ front: "a\tb", back: "c\nd" }]))).toEqual({
      cards: [{ front: "a b", back: "c d" }],
      skipped: 0,
    });
  });

  it("round-trips an export back into cards", () => {
    expect(parseImport(toTsv(cards))).toEqual({ cards, skipped: 0 });
  });

  it("accepts Anki's :: separator", () => {
    expect(parseImport("Front side::Back side")).toEqual({
      cards: [{ front: "Front side", back: "Back side" }],
      skipped: 0,
    });
  });

  it("drops the exported header and blank lines without counting them", () => {
    const text = "front\tback\n\nWhat is 2+2?\t4\n";
    expect(parseImport(text)).toEqual({
      cards: [{ front: "What is 2+2?", back: "4" }],
      skipped: 0,
    });
  });

  it("counts lines with no usable pair instead of dropping them silently", () => {
    const text = "just one column\nFront without back\t\n\tBack without front\nkeep\tme";
    expect(parseImport(text)).toEqual({ cards: [{ front: "keep", back: "me" }], skipped: 3 });
  });

  it("round-trips CRLF pastes from elsewhere", () => {
    expect(parseImport("a\tb\r\nc\td\r\n")).toEqual({
      cards: [
        { front: "a", back: "b" },
        { front: "c", back: "d" },
      ],
      skipped: 0,
    });
  });
});

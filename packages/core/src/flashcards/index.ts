/**
 * Spaced repetition for flashcards (P9): SM-2 scheduling, the due/hard
 * classification the lists are read by, and the TSV exchange format behind
 * manual import/export.
 *
 * The scheduler is the server's authority (routes write what it returns) and
 * the study screen runs the same function to preview the next interval the
 * moment a rating is pressed — one implementation, so the preview cannot
 * disagree with what gets stored.
 *
 * Ratings follow plan §18's stored vocabulary (again | hard | good | easy) and
 * carry the labels PRD §14 asks the student for: know, need to review, and
 * difficult cards repeat. `RATING_LABEL` is the only place the two vocabularies
 * meet.
 */

/** How a card went, as stored. The vocabulary of plan §18's data model. */
export type Rating = "again" | "hard" | "good" | "easy";

/** What the rating buttons say — PRD §14's words, in ascending quality. */
export const RATING_LABEL: Record<Rating, string> = {
  again: "Review",
  hard: "Hard",
  good: "Know",
  easy: "Easy",
};

/** The scheduling fields of a card, exactly as the flashcards table holds them. */
export interface CardSchedule {
  ease: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueAt: Date | null;
  lastReviewedAt: Date | null;
}

/** What the scheduler needs to know about the card it is being asked about. */
export type CardState = Pick<CardSchedule, "ease" | "intervalDays" | "repetitions" | "lapses">;

/** SM-2's floor: below 1.3 the interval formula compounds backwards over time. */
export const MIN_EASE = 1.3;

const EASE_UP = 0.15; // easy
const EASE_DOWN = 0.15; // hard
const EASE_LAPSE = 0.2; // review — a miss costs more than a hard pass

const DAY_MS = 86_400_000;

/**
 * Apply one rating (classic SM-2: 1 → 6 day opening, then ease-compounded).
 *
 * A "review" (miss) resets the card: repetitions to zero, lapses counted, ease
 * discounted, and the card due again immediately — due *now*, not tomorrow, so
 * it is waiting in the next batch. Within a batch it is shown once: a session
 * that could requeue its own failures would never end.
 */
export function schedule(card: CardState, rating: Rating, now: Date): CardSchedule {
  const lastReviewedAt = new Date(now.getTime());

  if (rating === "again") {
    return {
      ease: Math.max(MIN_EASE, card.ease - EASE_LAPSE),
      intervalDays: 0,
      repetitions: 0,
      lapses: card.lapses + 1,
      dueAt: new Date(now.getTime()),
      lastReviewedAt,
    };
  }

  const easeDelta = rating === "easy" ? EASE_UP : rating === "hard" ? -EASE_DOWN : 0;
  const ease = Math.max(MIN_EASE, card.ease + easeDelta);
  const repetitions = card.repetitions + 1;
  // First pass: tomorrow. Second: six days out (SM-2's fixed opening). From
  // there the interval rides the card's own ease — a card eased down by "hard"
  // still grows, just slower, and never by less than a day.
  const intervalDays =
    repetitions === 1
      ? 1
      : repetitions === 2
        ? 6
        : Math.max(Math.round(card.intervalDays * ease), card.intervalDays + 1);

  return {
    ease,
    intervalDays,
    repetitions,
    lapses: card.lapses,
    dueAt: new Date(now.getTime() + intervalDays * DAY_MS),
    lastReviewedAt,
  };
}

/**
 * Due today or overdue. A card never reviewed (dueAt null) is due from the
 * moment it is saved — a new deck is studyable immediately.
 */
export function isDue(card: { dueAt: Date | string | null }, now: Date): boolean {
  if (card.dueAt == null) return true;
  const due = typeof card.dueAt === "string" ? new Date(card.dueAt) : card.dueAt;
  return due.getTime() <= now.getTime();
}

/** Difficult means missed at least once (PRD §14's "repeat difficult cards"). */
export function isHard(card: { lapses: number }): boolean {
  return card.lapses >= 1;
}

/** One exported line: front TAB back, with the separators flattened out of the text. */
function flat(text: string): string {
  return text.replace(/[\t\r\n]+/g, " ").trim();
}

/** The deck as plain text: one `front<TAB>back` line per card (Anki's text format). */
export function toTsv(cards: { front: string; back: string }[]): string {
  return cards.map((c) => `${flat(c.front)}\t${flat(c.back)}`).join("\n");
}

export interface ImportResult {
  cards: { front: string; back: string }[];
  /** Lines that held no usable pair — reported so a paste never fails silently. */
  skipped: number;
}

/**
 * Cards out of pasted text. Tab-separated is the format this app exports;
 * `::` (Anki's older plain-text separator) is accepted so a paste from
 * elsewhere still lands. A `front back` header line is recognised and dropped.
 */
export function parseImport(text: string): ImportResult {
  const cards: { front: string; back: string }[] = [];
  let skipped = 0;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const separator = line.includes("\t") ? "\t" : line.includes("::") ? "::" : null;
    if (!separator) {
      skipped += 1;
      continue;
    }

    const cut = line.indexOf(separator);
    const front = line.slice(0, cut).trim();
    const back = line.slice(cut + separator.length).trim();

    if (!front || !back) {
      skipped += 1;
      continue;
    }
    if (cards.length === 0 && front.toLowerCase() === "front" && back.toLowerCase() === "back")
      continue; // the exported header, not a card

    cards.push({ front, back });
  }

  return { cards, skipped };
}

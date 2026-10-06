/**
 * Quiz grading, weak-concept grouping and concept mastery (P8, PRD sections 11–13).
 *
 * Shared by the server and the UI: the server grades once at submit time and stores the
 * verdicts, and the results screen renders exactly what was stored — re-reading a saved
 * attempt never re-grades it against rules that may have changed since.
 *
 * Multiple choice and true/false grade exactly (modulo case and punctuation, which are
 * presentation). Short answers are graded by keyword overlap, because a note's phrasing
 * has many right answers — and when overlap cannot decide, the verdict is "needs_review"
 * and the student's own self-mark settles it (the plan's "self-mark correct"). An
 * unmarked needs_review counts against the score: a borderline answer left undecided is
 * not a point earned.
 */

import { weightedMastery } from "../progress/index.ts";

export type QuizVerdict = "correct" | "incorrect" | "needs_review";
export type SelfMark = "correct" | "incorrect";

/** The minimum a graded question needs: its type and the reference answer. */
export interface GradeableQuestion {
  type: string;
  correctAnswer: string;
}

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Words too common to identify an answer. */
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "to",
  "in",
  "is",
  "are",
  "was",
  "were",
  "and",
  "or",
  "for",
  "on",
  "it",
  "its",
  "that",
  "this",
  "these",
  "those",
  "with",
  "as",
  "by",
  "be",
  "been",
  "at",
  "from",
  "into",
  "than",
  "then",
  "not",
]);

/** Distinct significant words of an answer, for overlap comparison. */
function keywords(value: string): string[] {
  const seen = new Set<string>();
  for (const word of normalizeAnswer(value).split(" ")) {
    if (word.length > 1 && !STOP_WORDS.has(word)) seen.add(word);
  }
  return [...seen];
}

/** Whole-token presence, tolerating a plural on either side (newton ↔ newtons). */
function hasToken(tokens: Set<string>, word: string): boolean {
  if (tokens.has(word)) return true;
  if (tokens.has(word + "s")) return true;
  if (word.endsWith("s") && tokens.has(word.slice(0, -1))) return true;
  return false;
}

/**
 * Grade one answer.
 *
 * - `mcq` / `true_false`: exact match after normalisation. An empty answer is wrong.
 * - `short_answer`: exact match, or every reference keyword present → correct; some but
 *   not all → needs_review; none → incorrect.
 */
export function gradeAnswer(question: GradeableQuestion, answer: string): QuizVerdict {
  const given = normalizeAnswer(answer);
  const reference = normalizeAnswer(question.correctAnswer);

  if (question.type !== "short_answer") {
    return given === reference && given !== "" ? "correct" : "incorrect";
  }

  if (given === "") return "incorrect";
  if (given === reference) return "correct";

  const refWords = keywords(question.correctAnswer);
  if (refWords.length === 0) return given === reference ? "correct" : "needs_review";

  const givenWords = new Set(given.split(" ").filter((w) => w.length > 1));
  const matched = refWords.filter((w) => hasToken(givenWords, w));

  if (matched.length === refWords.length) return "correct";
  if (matched.length === 0) return "incorrect";
  return "needs_review";
}

/**
 * The verdict the score counts. Self-marks only apply to `needs_review` — a multiple
 * choice answer is not up for debate — and an undecided one counts as incorrect.
 */
export function finalVerdict(verdict: QuizVerdict, selfMark?: SelfMark): "correct" | "incorrect" {
  if (verdict === "needs_review") return selfMark ?? "incorrect";
  return verdict;
}

export interface SubmittedAnswer {
  questionId: string;
  answer: string;
  selfMark?: SelfMark;
}

export interface QuestionResult {
  questionId: string;
  /** What the student submitted ("" when they never answered). */
  answer: string;
  /** The rule's own verdict, before any self-mark. */
  verdict: QuizVerdict;
  /** What the score counted. */
  correct: boolean;
}

/**
 * Grade a whole submission, in question order.
 *
 * Questions with no submitted answer are graded as unanswered (incorrect). Submissions
 * for ids that are not in `questions` are ignored here — the route validates ids first,
 * so a stray id is a 400 rather than silently dropped.
 */
export function gradeQuiz(
  questions: (GradeableQuestion & { id: string })[],
  submitted: SubmittedAnswer[],
): QuestionResult[] {
  const byId = new Map<string, SubmittedAnswer>();
  for (const s of submitted) if (!byId.has(s.questionId)) byId.set(s.questionId, s);

  return questions.map((q) => {
    const s = byId.get(q.id);
    const verdict = gradeAnswer(q, s?.answer ?? "");
    const settled = finalVerdict(verdict, s?.selfMark);
    return {
      questionId: q.id,
      answer: s?.answer ?? "",
      verdict,
      correct: settled === "correct",
    };
  });
}

/** Correct answers out of total. */
export function scoreOf(results: QuestionResult[]): { score: number; total: number } {
  return {
    score: results.filter((r) => r.correct).length,
    total: results.length,
  };
}

export interface WeakConcept {
  conceptTag: string;
  /** Wrong answers on this concept — the number that hurts. */
  missed: number;
  total: number;
}

/**
 * Concepts the student struggled with (PRD section 12 "Needs Review"), worst first.
 * Questions without a concept tag cannot group, so they are left out: a retry needs
 * something to focus on. A concept answered correctly everywhere is left out too —
 * it slipped nowhere, so there is nothing to review and listing it would dilute the
 * screen that tells the student where to look.
 */
export function weakConcepts(
  items: { conceptTag?: string | null; correct: boolean }[],
): WeakConcept[] {
  const groups = new Map<string, WeakConcept>();

  for (const item of items) {
    const tag = item.conceptTag?.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    const group = groups.get(key) ?? { conceptTag: tag, missed: 0, total: 0 };
    group.total += 1;
    if (!item.correct) group.missed += 1;
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((group) => group.missed > 0)
    .sort(
      (a, b) =>
        b.missed - a.missed || b.total - a.total || a.conceptTag.localeCompare(b.conceptTag),
    );
}

/** The concepts a focused retry quiz should target (PRD section 13), worst first. */
export function retryFocus(weak: WeakConcept[], max = 3): string[] {
  return weak
    .filter((w) => w.missed > 0)
    .slice(0, Math.max(0, max))
    .map((w) => w.conceptTag);
}

export interface MasteryState {
  attempts: number;
  correct: number;
  mastery: number;
}

/**
 * One more answer folded into a concept's mastery.
 *
 * Mastery is correct/total over the concept's attempts — the same formula as
 * `weightedMastery` in progress (ADR-016), so the number feeding topic progress and the
 * number shown here can never disagree. Rolling accuracy means a concept recovers when
 * the student gets it right again, and falls when they stop.
 */
export function nextMastery(state: MasteryState, wasCorrect: boolean): MasteryState {
  const attempts = state.attempts + 1;
  const correct = state.correct + (wasCorrect ? 1 : 0);
  return { attempts, correct, mastery: weightedMastery(correct, attempts) };
}

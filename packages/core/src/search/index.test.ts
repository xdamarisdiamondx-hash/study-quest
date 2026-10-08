import { describe, expect, it } from "vitest";

import {
  bigrams,
  buildSegments,
  buildTsQuery,
  dice,
  excerptAround,
  hrefFor,
  normalizeQuery,
  rankSearch,
  recentKey,
  scoreMatch,
  searchTokens,
  wordScore,
  type SearchRow,
} from "./index.ts";

describe("normalizeQuery", () => {
  it("trims, collapses whitespace and caps length", () => {
    expect(normalizeQuery("  Newton's   laws  ")).toBe("Newton's laws");
    expect(normalizeQuery("x".repeat(300))).toHaveLength(120);
    expect(normalizeQuery(42)).toBe("");
    expect(normalizeQuery(null)).toBe("");
  });
});

describe("searchTokens", () => {
  it("lowercases, splits punctuation and drops single letters", () => {
    expect(searchTokens("Newton's Laws, 101")).toEqual(["newton", "laws", "101"]);
    expect(searchTokens("a s")).toEqual([]);
  });
  it("folds diacritics and deduplicates in order", () => {
    expect(searchTokens("Café café CRÈME")).toEqual(["cafe", "creme"]);
    expect(searchTokens("newton NEWTON")).toEqual(["newton"]);
  });
});

describe("buildTsQuery", () => {
  it("prefixes every token and ANDs them — the plan's 'Newt' finds 'Newton'", () => {
    expect(buildTsQuery("Newt")).toBe("newt:*");
    expect(buildTsQuery("newton's laws")).toBe("newton:* & laws:*");
  });
  it("is injection-proof and bounded", () => {
    const q = buildTsQuery("'); drop table users; --");
    expect(q).toBe("drop:* & table:* & users:*");
    expect(q).not.toMatch(/['";()]/);
    expect(buildTsQuery("one two three four five six seven eight nine")).toBe(
      "one:* & two:* & three:* & four:* & five:* & six:* & seven:* & eight:*",
    );
  });
  it("returns null when nothing searchable remains", () => {
    expect(buildTsQuery("   ")).toBeNull();
    expect(buildTsQuery("?!")).toBeNull();
    expect(buildTsQuery(1)).toBeNull();
  });
});

describe("dice / bigrams", () => {
  it("scores identical words 1 and disjoint words 0", () => {
    expect(dice("newton", "newton")).toBe(1);
    expect(bigrams("abc")).toEqual(["ab", "bc"]);
    expect(dice("abc", "xyz")).toBe(0);
  });
});

describe("wordScore", () => {
  it("orders exact > prefix > trailing typo > infix > fuzzy > nothing", () => {
    const exact = wordScore("newton", "newton");
    const prefix = wordScore("newt", "newton");
    const trailing = wordScore("newtonz", "newton");
    const infix = wordScore("ewton", "newton");
    const fuzzy = wordScore("nuton", "newton");
    expect(exact).toBe(1);
    expect(prefix).toBeGreaterThan(0.82);
    expect(prefix).toBeLessThan(1);
    expect(trailing).toBeCloseTo(0.78, 2);
    expect(infix).toBeCloseTo(0.72, 2);
    expect(fuzzy).toBeGreaterThan(0.5);
    expect(fuzzy).toBeLessThan(exact);
    expect(fuzzy).toBeGreaterThan(0);
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(trailing);
    expect(trailing).toBeGreaterThan(infix);
    expect(infix).toBeGreaterThan(fuzzy);
    expect(fuzzy).toBeGreaterThan(0);
  });
  it("rejects look-alikes that are not typos", () => {
    expect(wordScore("math", "mass")).toBe(0);
    // "cat" is a genuine prefix of "catalogue" — the prefix rule fires first.
    expect(wordScore("cat", "catalogue")).toBeCloseTo(0.873, 2);
    expect(wordScore("car", "bus")).toBe(0);
    expect(wordScore("", "newton")).toBe(0);
  });
});

describe("scoreMatch", () => {
  it("an exact title beats a prefix title, which beats a body hit", () => {
    const exact = scoreMatch("newton", "Newton", "");
    const prefix = scoreMatch("newt", "Newton's Laws", "");
    const body = scoreMatch("newton", "Mechanics", "About Newton and his laws");
    const fuzzy = scoreMatch("Nuton", "Mechanics", "About Newton");
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(body);
    expect(body).toBeGreaterThan(fuzzy);
    expect(fuzzy).toBeGreaterThan(0);
    expect(scoreMatch("newton", "Mechanics", "About Kepler")).toBe(0);
    expect(scoreMatch("", "Newton", "laws")).toBe(0);
  });
  it("partial coverage scores below a full match of the same tokens", () => {
    const full = scoreMatch("newton laws", "Newton's laws of motion", "");
    const partial = scoreMatch("newton laws", "Newton was here", "");
    expect(full).toBeGreaterThan(partial);
    expect(partial).toBeGreaterThan(0);
  });
  it("the indexed ts_rank breaks an otherwise even tie", () => {
    const ranked = scoreMatch("newton", "Mechanics", "Newton", 0.4);
    const plain = scoreMatch("newton", "Mechanics", "Newton");
    expect(ranked).toBeGreaterThan(plain);
  });
});

describe("excerptAround", () => {
  it("returns short text whole and windows long text around the first hit", () => {
    expect(excerptAround("newton", "Newton's laws")).toBe("Newton's laws");
    const long = `${"filler ".repeat(60)}the experiments Newton ran ${"tail ".repeat(40)}`;
    const out = excerptAround("newton", long, 120);
    expect(out.length).toBeLessThanOrEqual(124);
    expect(out).toContain("Newton");
    expect(out.startsWith("…")).toBe(true);
    expect(out.endsWith("…")).toBe(true);
  });
  it("falls back to the opening when there is no hit", () => {
    const out = excerptAround("zebra", "a".repeat(100) + " tail", 40);
    expect(out.startsWith("aaaa")).toBe(true);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("buildSegments", () => {
  it("marks the typed letters inside a longer word", () => {
    expect(buildSegments("newt", "The Newton laws")).toEqual([
      { text: "The ", hit: false },
      { text: "Newt", hit: true },
      { text: "on laws", hit: false },
    ]);
  });
  it("marks the whole word for a fuzzy hit — 'Nuton' highlights 'Newton'", () => {
    expect(buildSegments("Nuton", "Isaac Newton")).toEqual([
      { text: "Isaac ", hit: false },
      { text: "Newton", hit: true },
    ]);
  });
  it("merges overlapping ranges into one hit", () => {
    expect(buildSegments("new newton", "newton")).toEqual([{ text: "newton", hit: true }]);
  });
  it("reaches into possessives the length guard would otherwise reject", () => {
    // "Newton's" is 8 characters against a 5-letter query — the gap of 3 fails
    // the fuzzy guard, so the bare word must be scored too.
    expect(buildSegments("newtn", "Newton's laws")).toEqual([
      { text: "Newton's", hit: true },
      { text: " laws", hit: false },
    ]);
    expect(scoreMatch("newtn", "Mechanics", "Newton's laws")).toBeGreaterThan(0);
  });
  it("returns one plain segment when nothing matches, none for empty text", () => {
    expect(buildSegments("zebra", "plain text")).toEqual([{ text: "plain text", hit: false }]);
    expect(buildSegments("zebra", "")).toEqual([]);
  });
});

describe("hrefFor", () => {
  it("points every type at the page that shows it", () => {
    expect(hrefFor("subject", { id: "s1" })).toBe("/study/s1");
    expect(hrefFor("topic", { id: "t1", subjectId: "s1" })).toBe("/study/s1?tab=topics&focus=t1");
    expect(hrefFor("note", { id: "n1", subjectId: "s1", topicId: "t1" })).toBe(
      "/study/s1/t1/notes?focus=n1",
    );
    expect(hrefFor("quiz", { id: "q1", subjectId: "s1" })).toBe("/study/s1?tab=quizzes&focus=q1");
    expect(hrefFor("flashcard", { id: "d1", subjectId: "s1" })).toBe(
      "/study/s1?tab=flashcards&focus=d1",
    );
    expect(hrefFor("task", { id: "k1" })).toBe("/tasks?focus=k1");
    expect(hrefFor("quest", { id: "c1" })).toBe("/quests?quest=c1");
  });
  it("links a flashcard card to its deck so the panel can open it", () => {
    expect(hrefFor("flashcard", { id: "c1", subjectId: "s1", deckId: "d1" })).toBe(
      "/study/s1?tab=flashcards&focus=c1&deck=d1",
    );
    // A deck row has no deck of its own to point at — plain focus stands.
    expect(hrefFor("flashcard", { id: "d1", subjectId: "s1", deckId: null })).toBe(
      "/study/s1?tab=flashcards&focus=d1",
    );
  });
  it("falls back to the list page when the parent is unknown", () => {
    expect(hrefFor("topic", { id: "t1" })).toBe("/study");
    expect(hrefFor("note", { id: "n1", subjectId: "s1" })).toBe("/study/s1?tab=notes&focus=n1");
    expect(hrefFor("note", { id: "n1" })).toBe("/study");
    expect(hrefFor("quiz", { id: "q1" })).toBe("/study");
    expect(hrefFor("flashcard", { id: "d1" })).toBe("/study");
  });
  it("URL-encodes ids", () => {
    expect(hrefFor("task", { id: "a b/c" })).toBe("/tasks?focus=a%20b%2Fc");
  });
});

describe("rankSearch", () => {
  const rows: SearchRow[] = [
    {
      type: "note",
      id: "n1",
      title: "Mechanics notes",
      body: "Newton's laws of motion",
      subjectId: "s1",
      topicId: "t1",
    },
    {
      type: "quiz",
      id: "q1",
      title: "Newton's Laws quiz",
      body: "",
      subjectId: "s1",
      topicId: "t1",
    },
    {
      type: "flashcard",
      id: "f1",
      title: "State Newton's first law",
      body: "Inertia",
      subjectId: "s1",
      topicId: "t1",
    },
    {
      type: "task",
      id: "k1",
      title: "Physics revision",
      body: "redo the Newton sheet",
      subjectId: null,
      topicId: null,
    },
    { type: "subject", id: "x1", title: "Chemistry", body: "", subjectId: null, topicId: null },
  ];

  it("orders exact-title above title-word above body-only, and skips non-matches", () => {
    const hits = rankSearch("Newton", rows);
    expect(hits.map((h) => h.id)).toEqual(["q1", "f1", "n1", "k1"]);
    expect(hits.map((h) => h.type)).toEqual(["quiz", "flashcard", "note", "task"]);
    // The array was just asserted to hold exactly these four, so indexing it is safe.
    expect(hits[0]!.score).toBeGreaterThanOrEqual(hits[1]!.score);
    for (const h of hits) expect(h.score).toBeGreaterThan(0.08);
  });
  it("the plan's exit case: 'Newton' finds the note, quiz, flashcards and task", () => {
    const found = rankSearch("Newton", rows).map((h) => h.type);
    expect(found).toContain("note");
    expect(found).toContain("quiz");
    expect(found).toContain("flashcard");
    expect(found).toContain("task");
  });
  it("marks the match in title and body segments and builds the href", () => {
    const note = rankSearch("Newton", rows).find((h) => h.type === "note");
    // "Mechanics notes" never says Newton — the mark belongs to the body alone.
    expect(note?.titleSegments.some((s) => s.hit)).toBe(false);
    expect(note?.bodySegments?.some((s) => s.hit)).toBe(true);
    expect(note?.href).toBe("/study/s1/t1/notes?focus=n1");
    const quiz = rankSearch("Newton", rows).find((h) => h.type === "quiz");
    expect(quiz?.titleSegments.some((s) => s.hit)).toBe(true);
    expect(quiz?.bodySegments).toBeNull();
  });
  it("is deterministic: equal scores break by type order, then title, then id", () => {
    const tied: SearchRow[] = [
      { type: "topic", id: "b", title: "Same", body: "same", subjectId: null, topicId: null },
      { type: "subject", id: "z", title: "Same", body: "same", subjectId: null, topicId: null },
      { type: "subject", id: "a", title: "Same", body: "same", subjectId: null, topicId: null },
      { type: "subject", id: "c", title: "Able", body: "same", subjectId: null, topicId: null },
    ];
    const first = rankSearch("same", tied).map((h) => `${h.type}:${h.id}:${h.title}`);
    const second = rankSearch("same", [...tied].reverse()).map(
      (h) => `${h.type}:${h.id}:${h.title}`,
    );
    expect(first).toEqual(second);
    expect(first[0]).toBe("subject:a:Same");
    expect(first[1]).toBe("subject:z:Same");
    expect(first[2]).toBe("topic:b:Same");
    expect(first[3]).toBe("subject:c:Able");
  });
  it("respects the limit and answers nothing for an empty query", () => {
    expect(rankSearch("Newton", rows, 2)).toHaveLength(2);
    expect(rankSearch("   ", rows)).toEqual([]);
    expect(rankSearch("zebra", rows)).toEqual([]);
  });
});

describe("recentKey", () => {
  it("normalizes for dedupe but keeps words in order", () => {
    expect(recentKey("  Newton's  Laws ")).toBe("newton laws");
    expect(recentKey("newton laws")).toBe(recentKey("NEWTON   LAWS"));
    expect(recentKey("?!")).toBe("");
  });
});

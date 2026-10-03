import { describe, expect, it } from "vitest";

import { applyReorder, move, nudge, resequence } from "./order";

const rows = (...names: string[]) => names.map((name, index) => ({ id: name, orderIndex: index }));

describe("applyReorder", () => {
  it("assigns a dense 0..n-1 sequence in the given order", () => {
    const result = applyReorder(rows("a", "b", "c"), ["c", "a", "b"]);
    expect(result.get("c")).toBe(0);
    expect(result.get("a")).toBe(1);
    expect(result.get("b")).toBe(2);
  });

  it("covers every row exactly once", () => {
    const result = applyReorder(rows("a", "b", "c"), ["b", "a", "c"]);
    expect(result.size).toBe(3);
    expect(new Set(result.values())).toEqual(new Set([0, 1, 2]));
  });

  it("ignores ids that are not in the list", () => {
    const result = applyReorder(rows("a", "b"), ["b", "ghost"]);
    expect(result.size).toBe(2);
    expect(result.get("b")).toBe(0);
    expect(result.get("a")).toBe(1);
  });

  it("keeps omitted rows after the ones that were named", () => {
    const result = applyReorder(rows("a", "b", "c", "d"), ["d"]);
    expect(result.get("d")).toBe(0);
    // a, b and c were not named, so they keep their relative order after d.
    expect(result.get("a")).toBe(1);
    expect(result.get("b")).toBe(2);
    expect(result.get("c")).toBe(3);
  });

  it("is a no-op when given the current order", () => {
    const result = applyReorder(rows("a", "b", "c"), ["a", "b", "c"]);
    expect([...result.entries()]).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ]);
  });
});

describe("resequence", () => {
  it("closes gaps left by a delete", () => {
    // a=0, b=2, c=5 — gaps from earlier removals.
    const result = resequence([
      { id: "a", orderIndex: 0 },
      { id: "b", orderIndex: 2 },
      { id: "c", orderIndex: 5 },
    ]);
    expect([...result.values()]).toEqual([0, 1, 2]);
  });

  it("orders by the existing index, not array order", () => {
    const result = resequence([
      { id: "c", orderIndex: 2 },
      { id: "a", orderIndex: 0 },
      { id: "b", orderIndex: 1 },
    ]);
    expect(result.get("a")).toBe(0);
    expect(result.get("b")).toBe(1);
    expect(result.get("c")).toBe(2);
  });
});

describe("move", () => {
  it("moves an item forwards and backwards", () => {
    expect(move(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(move(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("clamps an out-of-range destination instead of corrupting the list", () => {
    expect(move(["a", "b", "c"], 0, 99)).toEqual(["b", "c", "a"]);
    expect(move(["a", "b", "c"], 2, -5)).toEqual(["c", "a", "b"]);
  });

  it("ignores an out-of-range source", () => {
    expect(move(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });

  it("does not mutate the input", () => {
    const input = ["a", "b", "c"];
    move(input, 0, 2);
    expect(input).toEqual(["a", "b", "c"]);
  });
});

describe("nudge", () => {
  it("moves one position at a time", () => {
    expect(nudge(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(nudge(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("leaves the list alone at either end", () => {
    expect(nudge(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(nudge(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });
});

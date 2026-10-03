/**
 * Ordering rules for subjects and topics.
 *
 * Order is stored as a dense 0..n-1 integer sequence so a drag never leaves gaps that make
 * the next reorder ambiguous. These functions are pure so they can be tested without a
 * database.
 */

export interface Ordered {
  id: string;
  orderIndex: number;
}

/**
 * Reorder `rows` to match `orderedIds`.
 *
 * Ids that are absent keep their relative order after the ones named, so a partial drag
 * from a stale list cannot silently drop a row. Returns new `orderIndex` values.
 */
export function applyReorder<T extends Ordered>(
  rows: T[],
  orderedIds: string[],
): Map<string, number> {
  const known = new Set(rows.map((r) => r.id));
  const ordered = orderedIds.filter((id) => known.has(id));

  // Anything the caller did not mention keeps its existing relative order, after the rest.
  const rest = rows
    .filter((r) => !ordered.includes(r.id))
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const result = new Map<string, number>();
  [...ordered, ...rest.map((r) => r.id)].forEach((id, index) => result.set(id, index));
  return result;
}

/** Renumber to a dense 0..n-1 sequence. Used after a delete. */
export function resequence<T extends Ordered>(rows: T[]): Map<string, number> {
  const sorted = [...rows].sort((a, b) => a.orderIndex - b.orderIndex);
  const result = new Map<string, number>();
  sorted.forEach((row, index) => result.set(row.id, index));
  return result;
}

/**
 * Where a row landed when moved from one position to another.
 * Clamped so an out-of-range drop cannot corrupt the sequence.
 */
export function move<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return items;
  next.splice(Math.max(0, Math.min(next.length, to)), 0, moved);
  return next;
}

/** Move a row by `delta` positions, used by the keyboard reordering controls. */
export function nudge<T>(items: T[], from: number, delta: number): T[] {
  return move(items, from, from + delta);
}

/**
 * The pieces the palette and the search page must agree on (P19): the
 * <mark> renderer for a hit's segments and the grouping that puts subjects
 * first in PRD §29's type order. The rows around them differ on purpose —
 * the palette picks with the keyboard, the page links — so only what has to
 * match is shared.
 */
import { Fragment } from "react";
import {
  SEARCH_TYPES,
  SEARCH_TYPE_LABELS,
  type SearchHit,
  type SearchType,
  type Segment,
} from "@sq/core/search";

export function Segments({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.hit ? <mark key={i}>{seg.text}</mark> : <Fragment key={i}>{seg.text}</Fragment>,
      )}
    </>
  );
}

export interface HitGroup {
  type: SearchType;
  label: string;
  hits: SearchHit[];
}

/** Group hits by type in the order §29 lists them, dropping empty groups. */
export function groupHits(hits: SearchHit[]): HitGroup[] {
  return SEARCH_TYPES.map((type) => ({
    type,
    label: SEARCH_TYPE_LABELS[type],
    hits: hits.filter((hit) => hit.type === type),
  })).filter((group) => group.hits.length > 0);
}

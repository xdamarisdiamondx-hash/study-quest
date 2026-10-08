/**
 * `?focus=<id>` — the row a search result points at (P19), after P17's
 * `?quest=` pattern. The URL carries the target, so the outline survives a
 * refresh and the link stays shareable: rows mark themselves with
 * `data-focus="true"` when the param matches their id, and
 * `useScrollToFocus` centres whatever ended up marked.
 */
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

export function useFocusId(): string | null {
  const [params] = useSearchParams();
  return params.get("focus");
}

/**
 * Scroll the marked row into view once its list can actually contain it.
 *
 * `ready` is any value that changes at that moment — a loading flag, the
 * active tab, the view a page settled on — so the effect re-runs exactly
 * when there is something new to find. Before that it is a no-op rather
 * than a scroll against an empty list.
 */
export function useScrollToFocus(focusId: string | null, ready: unknown): void {
  useEffect(() => {
    if (!focusId || !ready) return;
    document.querySelector<HTMLElement>('[data-focus="true"]')?.scrollIntoView({ block: "center" });
  }, [focusId, ready]);
}

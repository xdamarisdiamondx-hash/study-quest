/**
 * The ⌘K palette (P19, PRD §29): one input over everything the student has.
 *
 * It searches as you type (debounced, late answers dropped), groups the
 * results in §29's order with the matched letters marked, and moves with the
 * arrow keys — ↵ opens, esc closes. An empty box offers the recent searches
 * back instead of a blank stare; picking a result (or asking for the full
 * page) files the query among them, so the next "that thing again" is two
 * keys away.
 *
 * Results are never *stored for* a query here — an answer is keyed by the
 * query it belongs to and read back only while that query is still in the
 * box. Clearing the input returns to the recents by derivation rather than
 * by a state reset (react-hooks/set-state-in-effect).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { SearchHit } from "@sq/core/search";

import { searchApi, type RecentSearch } from "../../lib/searchApi";
import { Segments, groupHits } from "./shared";

interface Answer {
  /** The trimmed query this answer belongs to; ignored once the box moves on. */
  q: string;
  status: "ready" | "error";
  hits: SearchHit[];
}

export function SearchPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  /** Which option the arrow keys are on — reset whenever fresh results land. */
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Bumped per keystroke: an answer whose id is stale loses the race. */
  const seq = useRef(0);

  const text = q.trim();
  const current = answer && answer.q === text ? answer : null;
  const error = current?.status === "error";
  const loading = text.length > 0 && current === null;
  // Memoized so the conditional's empty branch stays the same reference and
  // `groups` below only recomputes when an answer actually changes.
  const hits = useMemo(() => (current?.status === "ready" ? current.hits : []), [current]);

  const groups = useMemo(() => groupHits(hits), [hits]);
  const flat = useMemo(() => groups.flatMap((group) => group.hits), [groups]);
  /** What the arrow keys walk: results when typing, recents when not. */
  const count = text ? flat.length : recents.length;
  const cursorIndex = count > 0 ? Math.min(cursor, count - 1) : 0;

  // The recents load once, for the empty box.
  useEffect(() => {
    searchApi
      .recents()
      .then((r) => setRecents(r.recents))
      .catch(() => {});
  }, []);

  // Focus lands in the input on open; esc closes from wherever focus went.
  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The debounced search. The timer re-arms per keystroke and the sequence
  // number drops the answers that lost the race; state is written only in
  // the promise callbacks, never in the effect body.
  useEffect(() => {
    if (!text) return;
    const id = ++seq.current;
    const timer = setTimeout(() => {
      searchApi
        .search({ q: text })
        .then((res) => {
          if (seq.current !== id) return;
          setAnswer({ q: text, status: "ready", hits: res.results });
          setCursor(0);
        })
        .catch(() => {
          if (seq.current !== id) return;
          setAnswer({ q: text, status: "error", hits: [] });
        });
    }, 160);
    return () => clearTimeout(timer);
  }, [text]);

  function remember(query: string) {
    // Filing the query is a courtesy, not a requirement — the page loads
    // either way, so a failed save is swallowed.
    if (query) void searchApi.saveRecent(query).catch(() => {});
  }

  function open(hit: SearchHit) {
    remember(text);
    onClose();
    navigate(hit.href);
  }

  function applyRecent(recent: RecentSearch) {
    setCursor(0);
    setQ(recent.query);
    inputRef.current?.focus();
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => Math.min(c + 1, Math.max(count - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (!text) {
        const recent = recents[cursorIndex];
        if (recent) applyRecent(recent);
        return;
      }
      const hit = flat[cursorIndex];
      if (hit) open(hit);
    }
  }

  return (
    <div className="sq-palette-backdrop" onClick={onClose}>
      <div
        className="sq-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sq-palette-input">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <input
            ref={inputRef}
            className="sq-palette-field"
            type="text"
            role="combobox"
            aria-expanded
            aria-controls="sq-palette-list"
            aria-activedescendant={count > 0 ? `sq-palette-opt-${cursorIndex}` : undefined}
            aria-autocomplete="list"
            aria-label="Search everything"
            placeholder="Search everything…"
            maxLength={120}
            autoComplete="off"
            spellCheck={false}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {loading ? <span className="sq-label">Searching…</span> : null}
        </div>

        <div className="sq-palette-body" id="sq-palette-list" role="listbox" aria-label="Results">
          {error ? (
            <p className="sq-error" role="alert">
              Search is unavailable right now.
            </p>
          ) : !text ? (
            <>
              {recents.length > 0 ? (
                <>
                  <div className="sq-palette-group" role="presentation">
                    Recent
                  </div>
                  {recents.map((recent, i) => (
                    <div
                      key={recent.query}
                      id={`sq-palette-opt-${i}`}
                      role="option"
                      aria-selected={cursorIndex === i}
                      className={`sq-hit${cursorIndex === i ? " sq-hit-active" : ""}`}
                      onMouseMove={() => setCursor(i)}
                      onClick={() => applyRecent(recent)}
                    >
                      <b className="sq-hit-title">{recent.query}</b>
                    </div>
                  ))}
                </>
              ) : (
                <p className="sq-help" style={{ padding: "var(--s3)" }}>
                  Type to search subjects, topics, notes, tasks, quizzes, flashcards and quests.
                </p>
              )}
            </>
          ) : flat.length > 0 ? (
            groups.map((group) => {
              const start = flat.indexOf(group.hits[0]!);
              return (
                <div key={group.type}>
                  <div className="sq-palette-group" role="presentation">
                    {group.label}
                  </div>
                  {group.hits.map((hit, i) => {
                    const index = start + i;
                    return (
                      <div
                        key={hit.id}
                        id={`sq-palette-opt-${index}`}
                        role="option"
                        aria-selected={cursorIndex === index}
                        className={`sq-hit${cursorIndex === index ? " sq-hit-active" : ""}`}
                        onMouseMove={() => setCursor(index)}
                        onClick={() => open(hit)}
                      >
                        <b className="sq-hit-title">
                          <Segments segments={hit.titleSegments} />
                        </b>
                        <span className="sq-hit-tail">
                          {hit.context ? (
                            <span className="sq-hit-context">{hit.context}</span>
                          ) : null}
                          {hit.bodySegments ? (
                            <span className="sq-hit-excerpt">
                              <Segments segments={hit.bodySegments} />
                            </span>
                          ) : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })
          ) : current ? (
            <div className="sq-palette-empty">
              <b>No matches for “{text}”</b>
              <span className="sq-help">
                Near-misses are fine — “newtn” finds “Newton”. The full page can filter by type and
                subject.
              </span>
            </div>
          ) : null}
        </div>

        <div className="sq-palette-foot">
          <span className="sq-label">↑↓ move · ↵ open · esc close</span>
          {text ? (
            <Link
              to={`/search?q=${encodeURIComponent(text)}`}
              className="sq-palette-all"
              onClick={() => {
                remember(text);
                onClose();
              }}
            >
              All results <span aria-hidden="true">→</span>
            </Link>
          ) : (
            <Link to="/search" className="sq-palette-all" onClick={onClose}>
              Search page <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

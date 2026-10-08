/**
 * The full search screen (P19, PRD §29) — the palette's twin with the knobs
 * exposed: type chips and a subject filter live in the URL, so a filtered
 * result set is linkable and Back walks the filter changes. Results group by
 * entity with the match marked, and the empty and no-match states offer
 * recents and example queries rather than a dead end.
 *
 * The box is seeded from `?q=` once; from there typing owns it (the same
 * contract as the Tasks page's deep-linked filter). Enter files the query
 * among the recents — plain typing never does, or every keystroke would be
 * remembered as its own history entry.
 *
 * The fetch answers into an *answer keyed by the query it belongs to* and
 * the render reads it back only while that query is still current: no state
 * is reset inside an effect (react-hooks/set-state-in-effect), and clearing
 * the box empties the page by derivation.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, EmptyState, Picker } from "@sq/ui";
import { SEARCH_TYPES, SEARCH_TYPE_LABELS, type SearchHit, type SearchType } from "@sq/core/search";

import { searchApi, type RecentSearch } from "../../lib/searchApi";
import { useSubjects } from "../../lib/useSubjects";
import { Segments, groupHits } from "./shared";

/** Example queries for the suggestion rows — the ones the demo data answers. */
const EXAMPLES = ["Newton", "Motion", "Revise"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Answer {
  /** The query key this answer belongs to; stale once the box or filters move. */
  key: string;
  status: "ready" | "error";
  hits: SearchHit[];
  total: number;
}

function queryKey(q: string, type: SearchType | null, subjectId: string | null): string {
  return `${q.trim()}|${type ?? ""}|${subjectId ?? ""}`;
}

/** Unknown `?type=` values are dropped here rather than answered with a 400. */
function asType(raw: string | null): SearchType | null {
  return raw && (SEARCH_TYPES as readonly string[]).includes(raw) ? (raw as SearchType) : null;
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const type = asType(params.get("type"));
  const rawSubject = params.get("subjectId");
  const subjectId = rawSubject && UUID_RE.test(rawSubject) ? rawSubject : null;
  const subjects = useSubjects();

  const [input, setInput] = useState(q);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  /** Bumped per query: an answer whose id is stale loses the race. */
  const seq = useRef(0);

  const text = q.trim();
  const key = queryKey(q, type, subjectId);
  const current = answer && answer.key === key ? answer : null;
  // Memoized so the conditional's empty branch stays the same reference and
  // `groups` below only recomputes when an answer actually changes.
  const hits = useMemo(() => (current?.status === "ready" ? current.hits : []), [current]);
  const total = current?.status === "ready" ? current.total : 0;
  const status: "idle" | "loading" | "ready" | "error" = !text
    ? "idle"
    : current
      ? current.status
      : "loading";

  const groups = useMemo(() => groupHits(hits), [hits]);
  const filtered = Boolean(type || subjectId);

  // Box and URL stay in step (replace, not push — keystrokes are not
  // history), and malformed filter values are cleaned out on the way.
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (input.trim()) next.set("q", input.trim());
    else next.delete("q");
    if (next.get("type") && !asType(next.get("type"))) next.delete("type");
    if (next.get("subjectId") && !UUID_RE.test(next.get("subjectId")!)) next.delete("subjectId");
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [input, params, setParams]);

  // The fetch runs off the URL (not the box), so a pasted link and a typed
  // query take the same road. The timer re-arms per keystroke; the sequence
  // number drops the answers that lost the race. State is written only in
  // the promise callbacks — never in the effect body itself.
  useEffect(() => {
    if (!text) return;
    const id = ++seq.current;
    const ownKey = queryKey(q, type, subjectId);
    const timer = setTimeout(() => {
      searchApi
        .search({ q: text, type, subjectId })
        .then((res) => {
          if (seq.current !== id) return;
          setAnswer({ key: ownKey, status: "ready", hits: res.results, total: res.total });
        })
        .catch(() => {
          if (seq.current !== id) return;
          setAnswer({ key: ownKey, status: "error", hits: [], total: 0 });
        });
    }, 180);
    return () => clearTimeout(timer);
  }, [q, text, type, subjectId]);

  const loadRecents = () =>
    searchApi
      .recents()
      .then((r) => setRecents(r.recents))
      .catch(() => {});

  // One load per visit — the list only changes through the actions below.
  useEffect(() => {
    loadRecents();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (value)
      void searchApi
        .saveRecent(value)
        .then(() => loadRecents())
        .catch(() => {});
  }

  function setParam(param: "type" | "subjectId", value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(param, value);
    else next.delete(param);
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }

  function clearFilters() {
    const next = new URLSearchParams(params);
    next.delete("type");
    next.delete("subjectId");
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }

  function clearRecents() {
    void searchApi
      .clearRecents()
      .then(() => setRecents([]))
      .catch(() => {});
  }

  const suggestions = (
    <div className="sq-search-suggest">
      <span className="sq-label">Try</span>
      <div className="sq-row" style={{ gap: "var(--s2)", flexWrap: "wrap" }}>
        {EXAMPLES.map((value) => (
          <button key={value} type="button" className="sq-chip" onClick={() => setInput(value)}>
            {value}
          </button>
        ))}
      </div>
    </div>
  );

  const recentRow = recents.length > 0 && (
    <div className="sq-search-suggest">
      <span className="sq-label">Recent</span>
      <div className="sq-row" style={{ gap: "var(--s2)", flexWrap: "wrap" }}>
        {recents.map((recent) => (
          <button
            key={recent.query}
            type="button"
            className="sq-chip"
            onClick={() => setInput(recent.query)}
          >
            {recent.query}
          </button>
        ))}
        <button type="button" className="sq-chip" onClick={clearRecents}>
          Clear
        </button>
      </div>
    </div>
  );

  return (
    <div className="sq-col sq-search-page" style={{ marginTop: "var(--s6)" }}>
      <h1 style={{ font: "var(--t-h1)", margin: "0 0 var(--s4)", color: "var(--strong)" }}>
        Search
      </h1>

      <form className="sq-search-bar" role="search" onSubmit={submit}>
        <input
          className="sq-input sq-search-input"
          type="search"
          autoFocus
          maxLength={120}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search everything…"
          aria-label="Search your study content"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="sq-btn sq-btn-primary">
          Search
        </button>
      </form>

      <div className="sq-search-toolbar">
        <div
          className="sq-row"
          style={{ gap: "var(--s2)", flexWrap: "wrap" }}
          role="group"
          aria-label="Filter by type"
        >
          <button
            type="button"
            className={`sq-chip${type ? "" : " sq-chip-iris"}`}
            aria-pressed={!type}
            onClick={() => setParam("type", null)}
          >
            All
          </button>
          {SEARCH_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`sq-chip${type === t ? " sq-chip-iris" : ""}`}
              aria-pressed={type === t}
              onClick={() => setParam("type", type === t ? null : t)}
            >
              {SEARCH_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="sq-search-subject">
          <Picker
            label="Subject"
            value={subjectId}
            placeholder="All subjects"
            options={subjects.subjects.map((s) => ({ value: s.id, label: s.name }))}
            onChange={(value) => setParam("subjectId", value)}
          />
        </div>
      </div>

      {status === "error" ? (
        <div className="sq-error" role="alert">
          Search is unavailable right now.
        </div>
      ) : status === "idle" ? (
        <EmptyState
          monogram="⌕"
          title="Search everything you study"
          hint="Subjects, topics, notes, tasks, quizzes, flashcards and quests — type a word above."
          action={
            <>
              {recentRow}
              {suggestions}
            </>
          }
        />
      ) : status === "loading" ? (
        <p className="sq-help">Searching…</p>
      ) : groups.length === 0 ? (
        <EmptyState
          monogram="?"
          title={`No matches for “${text}”`}
          hint={
            filtered
              ? "Nothing under the current filters — clear them or try another word. Near-misses count: “newtn” finds “Newton”."
              : "Try fewer words — near-misses count: “newtn” finds “Newton”."
          }
          action={
            <>
              {filtered ? (
                <div style={{ marginBottom: "var(--s3)" }}>
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                </div>
              ) : null}
              {suggestions}
            </>
          }
        />
      ) : (
        <>
          <div className="sq-row" style={{ gap: "var(--s3)", alignItems: "baseline" }}>
            <p className="sq-label" style={{ margin: 0 }}>
              {hits.length} shown{total > hits.length ? ` of ${total} found` : ""}
            </p>
            {filtered ? (
              <button type="button" className="sq-chip" onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
          </div>

          {groups.map((group) => (
            <section key={group.type} className="sq-search-group">
              <h2 className="sq-search-group-label">
                {group.label}
                <span className="sq-label">{group.hits.length}</span>
              </h2>
              <ul className="sq-search-hits">
                {group.hits.map((hit) => (
                  <li key={hit.id}>
                    <Link to={hit.href} className="sq-hit">
                      <span className="sq-hit-head">
                        <b className="sq-hit-title">
                          <Segments segments={hit.titleSegments} />
                        </b>
                        {hit.context ? <span className="sq-hit-context">{hit.context}</span> : null}
                      </span>
                      {hit.bodySegments ? (
                        <span className="sq-hit-excerpt">
                          <Segments segments={hit.bodySegments} />
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

import { Suspense, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Monogram, Wordmark } from "@sq/ui";

import { useAuth } from "../lib/useAuth";
import { RewardsHost } from "../lib/rewards";
import { NotificationBell } from "../features/notifications/NotificationBell";
import { SearchPalette } from "../features/search/SearchPalette";
import { requestBackgroundSync } from "../offline/install";
import { useOfflineState } from "../offline/useOffline";
import { RouteFallback } from "./RouteFallback";
import { useTheme } from "./useTheme";

const SECTIONS = [
  {
    to: "/",
    label: "Home",
    icon: (
      <>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V20h14V9.5" />
      </>
    ),
  },
  {
    to: "/plan",
    label: "Plan",
    icon: (
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="2" />
        <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      </>
    ),
  },
  {
    to: "/tasks",
    label: "Tasks",
    icon: (
      <>
        <path d="M4 6h16M4 12h16M4 18h10" />
      </>
    ),
  },
  {
    to: "/study",
    label: "Study",
    icon: (
      <>
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
        <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
      </>
    ),
  },
  {
    to: "/quests",
    label: "Quests",
    icon: (
      <>
        <path d="M5 21V4" />
        <path d="M5 5h11l-2 3 2 3H5" />
      </>
    ),
  },
  {
    to: "/progress",
    label: "Progress",
    icon: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>
    ),
  },
];

function Tab({ to, label, icon }: (typeof SECTIONS)[number]) {
  return (
    <NavLink to={to} end={to === "/"} className="sq-tab">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {icon}
      </svg>
      {label}
    </NavLink>
  );
}

/** The shortcut shown on the header's search button — ⌘K where ⌘ exists. */
const SEARCH_KEY = /mac|iphone|ipad/i.test(navigator.platform) ? "⌘K" : "Ctrl K";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function AccountMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  if (!user) return null;

  return (
    <div className="sq-account" ref={ref}>
      <button
        type="button"
        className="sq-btn sq-btn-secondary sq-btn-sm"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu — ${initials(user.name) || "?"}`}
      >
        <Monogram text={initials(user.name) || "?"} />
      </button>

      {open ? (
        <div className="sq-account-panel" role="menu">
          <div className="sq-account-name">
            <b>{user.name}</b>
            <span>{user.email}</span>
          </div>
          <Link
            to="/settings"
            role="menuitem"
            className="sq-btn sq-btn-secondary sq-btn-block sq-btn-sm"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          <button
            type="button"
            className="sq-btn sq-btn-danger sq-btn-block sq-btn-sm"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell() {
  const { theme, toggle } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const queryClient = useQueryClient();
  const { online, queued } = useOfflineState();

  // The worker registers with an update PROMPT (P20): the student decides when
  // to reload, never a background swap underneath an unfinished quiz. Both
  // values arrive as [boolean, setter] tuples — unpack them or the array itself
  // is always truthy and the strip shows forever.
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
    offlineReady: [ready, setReady],
  } = useRegisterSW({
    onRegistered: () => requestBackgroundSync(),
  });

  // One listener answers every completed sync — a page drain or the worker's
  // background sync — by refetching what the queue may have changed.
  useEffect(() => {
    const onSynced = () => void queryClient.invalidateQueries();
    window.addEventListener("sq-synced", onSynced);
    return () => window.removeEventListener("sq-synced", onSynced);
  }, [queryClient]);

  // ⌘K on a Mac, Ctrl K everywhere else — one binding, from anywhere in the
  // shell, toggling the palette (P19).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    // The reward toasts and the level-up watcher live above the shell: every
    // page can fire a toast, and the watcher watches one key for all of them.
    <RewardsHost>
      <div className="sq-app">
        <header className="sq-topbar">
          <Wordmark />
          <span className="sq-topbar-spacer" />
          <button
            type="button"
            className="sq-btn sq-btn-secondary sq-btn-sm sq-search-btn"
            onClick={() => setSearchOpen(true)}
            // The visible "Ctrl K" hint is part of this button's text, so it has
            // to appear in the accessible name too (axe label-content-name-mismatch).
            aria-label={`Search (${SEARCH_KEY})`}
          >
            <svg
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
            <span className="sq-search-kbd" aria-hidden="true">
              {SEARCH_KEY}
            </span>
          </button>
          <NotificationBell />
          <button
            type="button"
            className="sq-btn sq-btn-secondary sq-btn-sm"
            onClick={toggle}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            >
              {theme === "dark" ? (
                <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m11.4 0 1.4 1.4M4.9 4.9l1.4 1.4" />
              ) : (
                <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
              )}
            </svg>
            <span className="sq-sr-only">{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
          {!online || queued > 0 ? (
            <span className="sq-pill sq-pill-offline" role="status">
              <span className="sq-pill-dot" aria-hidden="true" />
              {!online
                ? queued > 0
                  ? `Offline · ${queued} queued`
                  : "Offline"
                : `${queued} queued`}
            </span>
          ) : null}
          <AccountMenu />
        </header>

        {needRefresh ? (
          <div className="sq-strip sq-strip-update" role="status">
            <span>A new version of Study Quest is ready.</span>
            <button
              type="button"
              className="sq-btn sq-btn-primary sq-btn-sm"
              onClick={() => void updateServiceWorker(true)}
            >
              Reload
            </button>
          </div>
        ) : null}
        {ready ? (
          <div className="sq-strip sq-strip-ready" role="status">
            <span>Ready to work offline — your last-viewed pages are saved on this device.</span>
            <button
              type="button"
              className="sq-btn sq-btn-secondary sq-btn-sm"
              onClick={() => setReady(false)}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <div className="sq-app-body">
          <nav className="sq-rail" aria-label="Sections">
            {SECTIONS.map((s) => (
              <Tab key={s.to} {...s} />
            ))}
          </nav>

          <main className="sq-app-main">
            {/* Inner boundary: the shell (header, rail, strips) stays on screen
                while the route's chunk loads; the outer one in App.tsx only
                covers the pages that render without the shell. */}
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
          </main>
        </div>

        <nav className="sq-tabs" aria-label="Sections">
          {SECTIONS.map((s) => (
            <Tab key={s.to} {...s} />
          ))}
        </nav>

        {/* Mounted last: the palette is fixed-positioned and must sit above
            every part of the shell it can be summoned from. */}
        {searchOpen ? <SearchPalette onClose={() => setSearchOpen(false)} /> : null}
      </div>
    </RewardsHost>
  );
}

import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Monogram, Wordmark } from "@sq/ui";

import { useAuth } from "../lib/useAuth";
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
        aria-label="Account menu"
      >
        <Monogram text={initials(user.name) || "?"} />
      </button>

      {open ? (
        <div className="sq-account-panel" role="menu">
          <div className="sq-account-name">
            <b>{user.name}</b>
            <span>{user.email}</span>
          </div>
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

  return (
    <div className="sq-app">
      <header className="sq-topbar">
        <Wordmark />
        <span className="sq-topbar-spacer" />
        <button
          type="button"
          className="sq-btn sq-btn-secondary sq-btn-sm"
          onClick={toggle}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            {theme === "dark" ? <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m11.4 0 1.4 1.4M4.9 4.9l1.4 1.4" /> : <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />}
          </svg>
          <span className="sq-sr-only">{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
        <AccountMenu />
      </header>

      <div className="sq-app-body">
        <nav className="sq-rail" aria-label="Sections">
          {SECTIONS.map((s) => (
            <Tab key={s.to} {...s} />
          ))}
        </nav>

        <main className="sq-app-main">
          <Outlet />
        </main>
      </div>

      <nav className="sq-tabs" aria-label="Sections">
        {SECTIONS.map((s) => (
          <Tab key={s.to} {...s} />
        ))}
      </nav>
    </div>
  );
}

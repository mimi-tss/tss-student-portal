"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "theme";

// Manual light/dark switch (per-device, localStorage — no server state,
// no account-level preference). Dark stays the default for everyone
// who's never touched this; only an explicit click ever sets
// data-theme="light" on <html>, which is what theme-tokens.module.css's
// light overrides key off. The root layout's own inline script applies
// a stored choice before first paint so there's no dark-then-light
// flash on load — this component just needs to reflect that same state
// once it mounts (reading the DOM attribute the script already set,
// not localStorage again, so the two can never disagree).
export default function ThemeToggle() {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    setIsLight(document.documentElement.dataset.theme === "light");
  }, []);

  function toggle() {
    const next = isLight ? "dark" : "light";
    if (next === "light") {
      document.documentElement.dataset.theme = "light";
    } else {
      delete document.documentElement.dataset.theme;
    }
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing / storage blocked — the toggle still works for
      // this page view, it just won't be remembered next visit.
    }
    setIsLight(next === "light");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      className="rounded border border-[var(--border,#2c2c3d)] bg-[var(--surface-2,#20202f)] px-2 py-1 text-xs text-[var(--text-muted,#9997ab)] hover:text-[var(--text,#f4f0e6)]"
    >
      {isLight ? "☀︎" : "☾"}
    </button>
  );
}

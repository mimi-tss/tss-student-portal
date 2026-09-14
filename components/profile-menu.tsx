"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTimeZone } from "./timezone-context";
import { timezoneAbbreviation } from "@/lib/timezone";
import TimeZoneNavControl from "./timezone-nav-control";
import styles from "./profile-menu.module.css";

// Consolidates the avatar into an actual menu — "Fix stuck screen" and
// "Refresh" used to sit as permanent header buttons next to the bell,
// cluttering the bar for something almost nobody clicks day to day.
// Same two actions, same logic (session-reset-button.tsx/refresh-button.tsx
// still exist and back other surfaces, e.g. the error-boundary fallbacks,
// which render outside this layout entirely and still need their own
// standalone buttons), just moved behind one click instead of always
// visible.
export default function ProfileMenu({ initials }: { initials: string }) {
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { timeZone } = useTimeZone();

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleFixStuckScreen() {
    if (
      !window.confirm(
        "This will sign you out and take you back to the login screen — use this if your screen is stuck blank or won't load. Continue?",
      )
    ) {
      return;
    }
    setResetting(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className={styles.root} ref={rootRef}>
      {/* Passive confirmation of the active display timezone — the
          actual selector now lives inside the menu below, but this stays
          always-visible so it's still obvious at a glance which zone
          session times are shown in, without opening anything. */}
      <span className={styles.tzBadge} title={`Viewing times in ${timezoneAbbreviation(timeZone)}`}>
        {timezoneAbbreviation(timeZone)}
      </span>
      <button
        type="button"
        className={styles.avatarButton}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        {initials}
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.menuTz}>
            <TimeZoneNavControl />
          </div>
          <div className={styles.menuDivider} />
          <a
            href="/billing/account#account"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.menuLink}
            onClick={() => setOpen(false)}
          >
            Account
          </a>
          <a
            href="/billing/account#billing"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.menuLink}
            onClick={() => setOpen(false)}
          >
            Billing
          </a>
          <a
            href="/billing/addons"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.menuLink}
            onClick={() => setOpen(false)}
          >
            Add Ons
          </a>
          <div className={styles.menuDivider} />
          <button
            type="button"
            className={styles.menuButton}
            disabled={resetting}
            onClick={handleFixStuckScreen}
          >
            {resetting ? "Fixing…" : "Fix stuck screen"}
          </button>
          <button type="button" className={styles.menuButton} onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}

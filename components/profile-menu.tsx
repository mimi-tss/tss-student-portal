"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useHelpPanel } from "./help-panel";
import { OPEN_BUG_REPORT_EVENT } from "./bug-report-button";
import ThemeToggle from "./theme-toggle";
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
//
// On phones (<=640px) this is also the ONLY menu: the header drops the
// hamburger, the Report pill, the theme toggle, the Mel button and the
// timezone badge, and their links/actions show up here instead (the
// .mobileOnly block below) — one row of logo, bell, avatar.
const KAJABI_SITE_URL = process.env.NEXT_PUBLIC_KAJABI_SITE_URL ?? "";

export default function ProfileMenu({ initials }: { initials: string }) {
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { timeZone } = useTimeZone();
  const helpPanel = useHelpPanel();

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
          <div className={styles.mobileOnly}>
            <Link href="/student/book" className={styles.menuLink} onClick={() => setOpen(false)}>
              Scheduler
            </Link>
            <a href={`${KAJABI_SITE_URL}/library`} target="_self" className={styles.menuLink}>
              My Library
            </a>
            <a
              href={`${KAJABI_SITE_URL}/products/communities/v2/backstagehub`}
              target="_self"
              className={styles.menuLink}
            >
              Backstage
            </a>
            <div className={styles.menuDivider} />
            {helpPanel ? (
              <button
                type="button"
                className={styles.menuButton}
                onClick={() => {
                  setOpen(false);
                  helpPanel.toggle();
                }}
              >
                Chat with Mel (help)
              </button>
            ) : (
              <Link href="/help/chat" className={styles.menuLink} onClick={() => setOpen(false)}>
                Chat with Mel (help)
              </Link>
            )}
            <button
              type="button"
              className={styles.menuButton}
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new Event(OPEN_BUG_REPORT_EVENT));
              }}
            >
              Report a bug
            </button>
            <div className={styles.menuRow}>
              <span>Dark / light mode</span>
              <ThemeToggle />
            </div>
            <div className={styles.menuDivider} />
          </div>
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

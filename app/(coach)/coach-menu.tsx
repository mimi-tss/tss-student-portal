"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useHelpPanel } from "@/components/help-panel";
import { OPEN_BUG_REPORT_EVENT } from "@/components/bug-report-button";
import ThemeToggle from "@/components/theme-toggle";
import TimeZoneNavControl from "@/components/timezone-nav-control";
import { useTimeZone } from "@/components/timezone-context";
import { timezoneAbbreviation } from "@/lib/timezone";
import menuStyles from "@/components/profile-menu.module.css";
import { COACH_LINKS, KAJABI_SITE_URL } from "./coach-nav";

// Coach avatar menu — same look as the student one
// (components/profile-menu.tsx). Always holds timezone, Fix stuck screen
// and Refresh (they crowded the desktop header). On phones (<=640px) it's
// the only menu: the page links, Mel, Report a bug and the theme toggle
// show here too (.mobileOnly), replacing the old hamburger.
export default function CoachMenu({ initials }: { initials: string }) {
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const helpPanel = useHelpPanel();
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
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className={menuStyles.root} ref={rootRef}>
      <span className={menuStyles.tzBadge} title={`Viewing times in ${timezoneAbbreviation(timeZone)}`}>
        {timezoneAbbreviation(timeZone)}
      </span>
      <button
        type="button"
        className={menuStyles.avatarButton}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu"
      >
        {initials}
      </button>

      {open && (
        <div className={menuStyles.menu} role="menu">
          <div className={menuStyles.mobileOnly}>
            {COACH_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={menuStyles.menuLink}
                style={pathname?.startsWith(link.href) ? { fontWeight: 700 } : undefined}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <a href={`${KAJABI_SITE_URL}/library`} target="_self" className={menuStyles.menuLink}>
              My Library
            </a>
            <a
              href={`${KAJABI_SITE_URL}/products/communities/v2/backstagehub`}
              target="_self"
              className={menuStyles.menuLink}
            >
              Backstage
            </a>
            <div className={menuStyles.menuDivider} />
            {helpPanel && (
              <button
                type="button"
                className={menuStyles.menuButton}
                onClick={() => {
                  setOpen(false);
                  helpPanel.toggle();
                }}
              >
                Chat with Mel (help)
              </button>
            )}
            <button
              type="button"
              className={menuStyles.menuButton}
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new Event(OPEN_BUG_REPORT_EVENT));
              }}
            >
              Report a bug
            </button>
            <div className={menuStyles.menuRow}>
              <span>Dark / light mode</span>
              <ThemeToggle />
            </div>
            <div className={menuStyles.menuDivider} />
          </div>
          <div className={menuStyles.menuTz}>
            <TimeZoneNavControl />
          </div>
          <div className={menuStyles.menuDivider} />
          <button type="button" className={menuStyles.menuButton} disabled={resetting} onClick={handleFixStuckScreen}>
            {resetting ? "Fixing…" : "Fix stuck screen"}
          </button>
          <button type="button" className={menuStyles.menuButton} onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}

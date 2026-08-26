"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./coach.module.css";

const KAJABI_SITE_URL = process.env.NEXT_PUBLIC_KAJABI_SITE_URL ?? "";

// target="_self" (not _blank) so these navigate the current tab/iframe in
// place rather than popping a new tab — when embedded in Kajabi's Library
// Card iframe this keeps the coach inside the same full-viewport frame.
// Safe because Kajabi's own frame-ancestors CSP on /library and
// /products/communities/v2/backstagehub allows 'self' at this single
// nesting depth (confirmed via curl -sI against both). Don't revert to
// _blank without re-reading this.

const LINKS = [
  { href: "/coach/dashboard", label: "Dashboard" },
  { href: "/coach/schedule", label: "My Schedule" },
  { href: "/coach/students", label: "My Students" },
  { href: "/coach/payroll", label: "Payroll" },
];

// Below 640px (coach.module.css's .navToggle/.navLinks breakpoint), same
// as the student header — every link (internal pages + the external
// Kajabi ones) collapses into a hamburger dropdown instead of wrapping
// onto extra header rows. The timezone control lives in .headerRight,
// outside this nav, so it isn't duplicated into the dropdown here.
export default function CoachNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav className={styles.nav}>
      <div className={styles.navLinks}>
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={pathname?.startsWith(link.href) ? styles.navLinkActive : styles.navLink}
          >
            {link.label}
          </Link>
        ))}
        {/* Kajabi owns courses/community content (spec section 1) — links
            out rather than being built in this app, same as the student
            side. */}
        <a href={`${KAJABI_SITE_URL}/library`} target="_self" className={styles.navLink}>
          My Library
        </a>
        <a
          href={`${KAJABI_SITE_URL}/products/communities/v2/backstagehub`}
          target="_self"
          className={styles.navLink}
        >
          Backstage
        </a>
      </div>

      <button
        type="button"
        className={styles.navToggle}
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.navToggleBar} />
        <span className={styles.navToggleBar} />
        <span className={styles.navToggleBar} />
      </button>

      {open && (
        <div className={styles.navDropdown}>
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={pathname?.startsWith(link.href) ? styles.navDropdownLinkActive : styles.navDropdownLink}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className={styles.navDropdownDivider} />
          <a
            href={`${KAJABI_SITE_URL}/library`}
            target="_self"
            className={styles.navDropdownLink}
            onClick={() => setOpen(false)}
          >
            My Library
          </a>
          <a
            href={`${KAJABI_SITE_URL}/products/communities/v2/backstagehub`}
            target="_self"
            className={styles.navDropdownLink}
            onClick={() => setOpen(false)}
          >
            Backstage
          </a>
        </div>
      )}
    </nav>
  );
}

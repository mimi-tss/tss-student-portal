"use client";

import { useState } from "react";
import Link from "next/link";
import TimeZoneNavControl from "@/components/timezone-nav-control";
import styles from "./student.module.css";

const KAJABI_SITE_URL = process.env.NEXT_PUBLIC_KAJABI_SITE_URL ?? "";

// target="_self" (not _blank) so these navigate the current tab/iframe in
// place rather than popping a new tab — when embedded in Kajabi's Library
// Card iframe this keeps the member inside the same full-viewport frame.
// Safe because Kajabi's own frame-ancestors CSP on /library and
// /products/communities/v2/backstagehub allows 'self' at this single
// nesting depth (confirmed via curl -sI against both). Don't revert to
// _blank without re-reading this.

// Below 640px (student.module.css's .navToggle/.navLinks breakpoint) the
// external links + Scheduler + timezone control collapse into a dropdown
// instead of wrapping onto extra header rows — "Coaching Studio" stays
// visible outside it since it's the home link, not an external one.
export default function StudentNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className={styles.nav}>
      <Link href="/student/dashboard" className={styles.navLinkActive}>
        Coaching Studio
      </Link>

      <div className={styles.navLinks}>
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
        <Link href="/student/book" className={styles.navLink}>
          Scheduler
        </Link>
        <TimeZoneNavControl />
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
          <Link href="/student/book" className={styles.navDropdownLink} onClick={() => setOpen(false)}>
            Scheduler
          </Link>
          <div className={styles.navDropdownTz}>
            <TimeZoneNavControl />
          </div>
        </div>
      )}
    </nav>
  );
}

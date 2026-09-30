"use client";

import Link from "next/link";
import styles from "./student.module.css";

const KAJABI_SITE_URL = process.env.NEXT_PUBLIC_KAJABI_SITE_URL ?? "";

// target="_self" (not _blank) so these navigate the current tab/iframe in
// place rather than popping a new tab — when embedded in Kajabi's Library
// Card iframe this keeps the member inside the same full-viewport frame.
// Safe because Kajabi's own frame-ancestors CSP on /library and
// /products/communities/v2/backstagehub allows 'self' at this single
// nesting depth (confirmed via curl -sI against both). Don't revert to
// _blank without re-reading this.

// Below 640px (student.module.css's .navLinks breakpoint) the external
// links + Scheduler hide and live in the avatar menu instead
// (components/profile-menu.tsx) — one menu on phones, not a hamburger
// plus an avatar menu. "Coaching Studio" stays visible as the home link.
export default function StudentNav() {
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
      </div>
    </nav>
  );
}

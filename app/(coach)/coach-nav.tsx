"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./coach.module.css";

export const KAJABI_SITE_URL = process.env.NEXT_PUBLIC_KAJABI_SITE_URL ?? "";

// target="_self" (not _blank) so these navigate the current tab/iframe in
// place rather than popping a new tab — when embedded in Kajabi's Library
// Card iframe this keeps the coach inside the same full-viewport frame.
// Safe because Kajabi's own frame-ancestors CSP on /library and
// /products/communities/v2/backstagehub allows 'self' at this single
// nesting depth (confirmed via curl -sI against both). Don't revert to
// _blank without re-reading this.

export const COACH_LINKS = [
  { href: "/coach/dashboard", label: "Dashboard" },
  { href: "/coach/schedule", label: "My Schedule" },
  { href: "/coach/students", label: "My Students" },
  { href: "/coach/payroll", label: "Payroll" },
  { href: "/coach/help", label: "Help" },
];

// Below 640px (coach.module.css's .navLinks breakpoint), same as the
// student header — every link (internal pages + the external Kajabi
// ones) moves into the avatar menu (coach-menu.tsx) instead of a
// separate hamburger; only the current page's name shows here.
export default function CoachNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      <div className={styles.navLinks}>
        {COACH_LINKS.map((link) => (
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

      {/* Phones: links live in the avatar menu (coach-menu.tsx); just
          name the current page here. */}
      <span className={styles.navCurrent}>
        {COACH_LINKS.find((l) => pathname?.startsWith(l.href))?.label ?? "Coaching Studio"}
      </span>
    </nav>
  );
}

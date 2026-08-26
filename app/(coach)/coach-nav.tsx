"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./coach.module.css";

const KAJABI_SITE_URL = process.env.NEXT_PUBLIC_KAJABI_SITE_URL ?? "";

const LINKS = [
  { href: "/coach/dashboard", label: "Dashboard" },
  { href: "/coach/schedule", label: "My Schedule" },
  { href: "/coach/students", label: "My Students" },
  { href: "/coach/payroll", label: "Payroll" },
];

export default function CoachNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
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
      <a href={`${KAJABI_SITE_URL}/courses`} target="_blank" rel="noopener noreferrer" className={styles.navLink}>
        Courses
      </a>
      <a href={`${KAJABI_SITE_URL}/community`} target="_blank" rel="noopener noreferrer" className={styles.navLink}>
        Community
      </a>
    </nav>
  );
}

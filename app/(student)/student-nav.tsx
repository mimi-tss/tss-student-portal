"use client";

import { useState } from "react";
import Link from "next/link";
import TimeZoneNavControl from "@/components/timezone-nav-control";
import styles from "./student.module.css";

const KAJABI_SITE_URL = process.env.NEXT_PUBLIC_KAJABI_SITE_URL ?? "";

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
        <a href={`${KAJABI_SITE_URL}/library`} target="_blank" rel="noopener noreferrer" className={styles.navLink}>
          My Library
        </a>
        <a
          href={`${KAJABI_SITE_URL}/products/communities/v2/backstagehub`}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.navLink}
        >
          Backstage
        </a>
        <Link href="/student/book" className={styles.navLink}>
          Scheduler
        </Link>
        <TimeZoneNavControl dark />
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
            target="_blank"
            rel="noopener noreferrer"
            className={styles.navDropdownLink}
            onClick={() => setOpen(false)}
          >
            My Library
          </a>
          <a
            href={`${KAJABI_SITE_URL}/products/communities/v2/backstagehub`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.navDropdownLink}
            onClick={() => setOpen(false)}
          >
            Backstage
          </a>
          <Link href="/student/book" className={styles.navDropdownLink} onClick={() => setOpen(false)}>
            Scheduler
          </Link>
          <div className={styles.navDropdownTz}>
            <TimeZoneNavControl dark />
          </div>
        </div>
      )}
    </nav>
  );
}

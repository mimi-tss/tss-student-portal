"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import TimeZoneNavControl from "@/components/timezone-nav-control";
import type { Role } from "@/types/database";
import styles from "./admin.module.css";

const LINKS = [
  { href: "/admin/overview", label: "Overview", icon: "▦" },
  { href: "/admin/dashboard", label: "Students", icon: "◔" },
  { href: "/admin/coaches", label: "Coaches", icon: "◑" },
  { href: "/admin/needs-review", label: "Needs Review", icon: "◉", badgeKey: "needsReview" as const },
  { href: "/admin/community", label: "Community", icon: "◈" },
];

// Below the mockup's 6-item nav — Exercises, Group Lessons, Finance, and
// Reports are real, already-built features with no obvious home in that
// list, so they get their own section rather than being dropped.
// financeOnly: true means a plain "admin" doesn't get this link —
// Finance/Reports (pay rates, revenue, margin) are the only 2 things
// that differ between "admin" and "admin_finance"; every other page is
// shared by both. Each of those 2 pages also redirects a non-finance
// admin away on a direct URL hit (requireFinanceAccess,
// lib/auth/require-role.ts) — this isn't just a hidden-but-reachable link.
const MORE_LINKS = [
  { href: "/admin/exercises", label: "Exercises", icon: "♪", financeOnly: false },
  { href: "/admin/group-lessons", label: "Group Lessons", icon: "◫", financeOnly: false },
  { href: "/admin/finance", label: "Finance", icon: "$", financeOnly: true },
  { href: "/admin/reports", label: "Reports", icon: "◧", financeOnly: true },
];

export default function AdminNav({ needsReviewCount, role }: { needsReviewCount: number; role: Role }) {
  const pathname = usePathname();
  const hasFinance = role === "admin_finance";

  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(href + "/");
  }

  const moreLinks = hasFinance ? MORE_LINKS : MORE_LINKS.filter((l) => !l.financeOnly);

  return (
    <div className={styles.appSidebar}>
      <div className={styles.appSidebarBrand}>
        <img src="/logo.png" alt="Coaching Studio" className={styles.appSidebarLogo} />
        <div>
          <div className={styles.appSidebarBrandName}>Coaching Studio</div>
          <div className={styles.appSidebarBrandRole}>{hasFinance ? "Admin + Finance" : "Admin"}</div>
        </div>
      </div>

      <nav className={styles.appSidebarNav}>
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={isActive(link.href) ? styles.appSidebarLinkActive : styles.appSidebarLink}
          >
            <span className={styles.appSidebarLinkLabel}>
              <span aria-hidden>{link.icon}</span>
              {link.label}
            </span>
            {link.badgeKey === "needsReview" && needsReviewCount > 0 && (
              <span className={styles.appSidebarBadge}>{needsReviewCount}</span>
            )}
          </Link>
        ))}
        <div className={styles.appSidebarDivider} />
        {moreLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={isActive(link.href) ? styles.appSidebarLinkActive : styles.appSidebarLink}
          >
            <span className={styles.appSidebarLinkLabel}>
              <span aria-hidden>{link.icon}</span>
              {link.label}
            </span>
          </Link>
        ))}
      </nav>

      <div className={styles.appSidebarFooter}>
        <div className={styles.avatar} style={{ width: 30, height: 30, fontSize: 12 }}>
          A
        </div>
        <TimeZoneNavControl dark />
      </div>
    </div>
  );
}

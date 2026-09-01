"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import TimeZoneNavControl from "@/components/timezone-nav-control";
import type { Role } from "@/types/database";
import styles from "./admin.module.css";

const COLLAPSE_KEY = "admin-sidebar-collapsed";

const LINKS = [
  { href: "/admin/overview", label: "Overview", icon: "▦" },
  { href: "/admin/dashboard", label: "Students", icon: "◔" },
  { href: "/admin/coaches", label: "Coaches", icon: "◑" },
  { href: "/admin/needs-review", label: "Needs Review", icon: "◉", badgeKey: "needsReview" as const },
  { href: "/admin/community", label: "Backstage", icon: "◈" },
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
  { href: "/admin/activity-log", label: "Activity Log", icon: "▤", financeOnly: false },
  { href: "/admin/recordings", label: "Recordings", icon: "●", financeOnly: false },
  { href: "/admin/finance", label: "Finance", icon: "$", financeOnly: true },
  { href: "/admin/reports", label: "Reports", icon: "◧", financeOnly: true },
];

export default function AdminNav({ initialNeedsReviewCount, role }: { initialNeedsReviewCount: number; role: Role }) {
  const pathname = usePathname();
  const hasFinance = role === "admin_finance";
  const [collapsed, setCollapsed] = useState(false);
  const [needsReviewCount, setNeedsReviewCount] = useState(initialNeedsReviewCount);

  // Read the saved preference after mount rather than in useState's
  // initializer — localStorage doesn't exist during server rendering, so
  // reading it synchronously there would mismatch the client's first
  // render. A one-frame "starts expanded" flash on a returning collapsed
  // session is the acceptable tradeoff.
  useEffect(() => {
    if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
  }, []);

  // This nav lives in the admin layout, which (per Next.js App Router)
  // only re-runs its server component on a hard page load — a soft
  // client-side navigation between sibling admin pages (e.g. clicking
  // back into Needs Review after resolving items elsewhere) never
  // re-fetches it, so the badge could get stuck showing whatever count
  // was true when the admin section was first opened, arbitrarily far
  // out of date (confirmed live: showed 142 while the actual page
  // showed 58). Re-fetching the same count the Needs Review page itself
  // uses, on mount and again on every route change, keeps this close to
  // live without needing a shared store between every page that can
  // touch an attention_items row.
  useEffect(() => {
    fetch("/api/admin/attention-items?status=needs_action")
      .then((res) => res.json())
      .then((data) => setNeedsReviewCount((data.items ?? []).length))
      .catch(() => {});
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(href + "/");
  }

  const moreLinks = hasFinance ? MORE_LINKS : MORE_LINKS.filter((l) => !l.financeOnly);

  return (
    <div className={collapsed ? `${styles.appSidebar} ${styles.appSidebarCollapsed}` : styles.appSidebar}>
      <div className={styles.appSidebarBrand}>
        <img src="/logo.png" alt="Coaching Studio" className={styles.appSidebarLogo} />
        {!collapsed && (
          <div className={styles.appSidebarBrandText}>
            <div className={styles.appSidebarBrandName}>Coaching Studio</div>
            <div className={styles.appSidebarBrandRole}>{hasFinance ? "Admin + Finance" : "Admin"}</div>
          </div>
        )}
      </div>

      <nav className={styles.appSidebarNav}>
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            title={collapsed ? link.label : undefined}
            className={isActive(link.href) ? styles.appSidebarLinkActive : styles.appSidebarLink}
          >
            <span className={styles.appSidebarLinkLabel}>
              <span aria-hidden>{link.icon}</span>
              {!collapsed && link.label}
            </span>
            {link.badgeKey === "needsReview" && needsReviewCount > 0 && (
              <span className={collapsed ? styles.appSidebarBadgeDot : styles.appSidebarBadge}>
                {collapsed ? "" : needsReviewCount}
              </span>
            )}
          </Link>
        ))}
        <div className={styles.appSidebarDivider} />
        {moreLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            title={collapsed ? link.label : undefined}
            className={isActive(link.href) ? styles.appSidebarLinkActive : styles.appSidebarLink}
          >
            <span className={styles.appSidebarLinkLabel}>
              <span aria-hidden>{link.icon}</span>
              {!collapsed && link.label}
            </span>
          </Link>
        ))}
      </nav>

      <button
        type="button"
        onClick={toggleCollapsed}
        className={styles.appSidebarToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? "»" : "« Collapse"}
      </button>

      <div className={styles.appSidebarFooter}>
        <div className={styles.avatar} style={{ width: 30, height: 30, fontSize: 12, flexShrink: 0 }}>
          A
        </div>
        {!collapsed && <TimeZoneNavControl dark />}
      </div>
    </div>
  );
}

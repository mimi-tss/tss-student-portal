"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import TimeZoneNavControl from "@/components/timezone-nav-control";
import RefreshButton from "@/components/refresh-button";
import SessionResetButton from "@/components/session-reset-button";
import ThemeToggle from "@/components/theme-toggle";
import type { Role } from "@/types/database";
import styles from "./admin.module.css";

const COLLAPSE_KEY = "admin-sidebar-collapsed";

interface NavLink {
  href: string;
  label: string;
  icon: string;
  badgeKey?: "needsReview";
  // true means a plain "admin" doesn't get this link — Payroll/Reports
  // (pay rates, revenue, margin) are the only 2 things that differ
  // between "admin" and "admin_finance"; every other page is shared by
  // both. Each of those 2 pages also redirects a non-finance admin away
  // on a direct URL hit (requireFinanceAccess, lib/auth/require-role.ts)
  // — this isn't just a hidden-but-reachable link.
  financeOnly?: boolean;
}

interface NavSection {
  label?: string;
  // Tucked behind a toggle (and auto-opened when the current page is
  // inside it) — for the pages used least often, so the daily ones
  // aren't buried in a 15-item list.
  collapsible?: boolean;
  links: NavLink[];
}

// Ordered by how the studio actually works through a day: what needs
// attention first, then people, then lessons, then money, then the
// occasional-use pages.
const SECTIONS: NavSection[] = [
  {
    links: [
      { href: "/admin/overview", label: "Overview", icon: "▦" },
      { href: "/admin/needs-review", label: "Needs Review", icon: "◉", badgeKey: "needsReview" },
      { href: "/admin/support", label: "Support Chat", icon: "✉" },
    ],
  },
  {
    label: "People",
    links: [
      { href: "/admin/dashboard", label: "Students", icon: "◔" },
      { href: "/admin/coaches", label: "Coaches", icon: "◑" },
    ],
  },
  {
    label: "Lessons",
    links: [
      { href: "/admin/group-lessons", label: "Group Lessons", icon: "◫" },
      { href: "/admin/recordings", label: "Recordings", icon: "●" },
      { href: "/admin/exercises", label: "Exercises", icon: "♪" },
    ],
  },
  {
    label: "Money",
    links: [
      { href: "/admin/billing", label: "Billing", icon: "◆" },
      { href: "/admin/finance", label: "Payroll", icon: "$", financeOnly: true },
      { href: "/admin/reports", label: "Reports", icon: "◧", financeOnly: true },
    ],
  },
  {
    label: "More",
    collapsible: true,
    links: [
      { href: "/admin/weekly-email", label: "Weekly Email", icon: "✦" },
      { href: "/admin/activity-log", label: "Activity Log", icon: "▤" },
      { href: "/admin/bug-reports", label: "Bug Reports", icon: "✱" },
    ],
  },
];

export default function AdminNav({ initialNeedsReviewCount, role }: { initialNeedsReviewCount: number; role: Role }) {
  const pathname = usePathname();
  const hasFinance = role === "admin_finance";
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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
  // showed 58). Re-fetching on mount and again on every route change
  // keeps this close to live without needing a shared store between
  // every page that can touch an attention_items row.
  //
  // Hits the dedicated /count endpoint, not the main attention-items
  // route — that one calls getAttentionItems, which always re-runs the
  // full condition-driven sync (6+ kinds, including the batched
  // recording-matching pass) regardless of the status filter.
  // Confirmed live that took 1.6s+ per call, and since this fires on
  // every single navigation, EVERY admin page change was paying that
  // cost just to refresh a badge number — the actual root cause of a
  // real "the whole app is slow" report. /count is a plain read, no
  // sync — the real sync still happens whenever Needs Review or
  // Overview is actually loaded.
  useEffect(() => {
    fetch("/api/admin/attention-items/count")
      .then((res) => res.json())
      .then((data) => setNeedsReviewCount(data.count ?? 0))
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

  const sections = SECTIONS.map((section) => ({
    ...section,
    links: hasFinance ? section.links : section.links.filter((l) => !l.financeOnly),
  })).filter((section) => section.links.length > 0);

  // A page inside the collapsed "More" group must never leave its own
  // active link hidden.
  const currentPageInMore = SECTIONS.some(
    (s) => s.collapsible && s.links.some((l) => isActive(l.href)),
  );
  const moreShown = moreOpen || currentPageInMore;

  function renderLink(link: NavLink) {
    return (
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
    );
  }

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
        {sections.map((section, i) => (
          <div key={section.label ?? "top"}>
            {i > 0 &&
              (section.collapsible ? (
                <button
                  type="button"
                  onClick={() => setMoreOpen(!moreShown)}
                  className={styles.appSidebarSectionToggle}
                  aria-expanded={moreShown}
                  title={collapsed ? section.label : undefined}
                >
                  <span>{collapsed ? "⋯" : section.label}</span>
                  {!collapsed && <span aria-hidden>{moreShown ? "▾" : "▸"}</span>}
                </button>
              ) : collapsed ? (
                <div className={styles.appSidebarDivider} />
              ) : (
                <div className={styles.appSidebarSectionLabel}>{section.label}</div>
              ))}
            {(!section.collapsible || moreShown) && section.links.map(renderLink)}
          </div>
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
        <div className={styles.appSidebarFooterTop}>
          <div className={styles.avatar} style={{ width: 30, height: 30, fontSize: 12, flexShrink: 0 }}>
            A
          </div>
        </div>
        {!collapsed && (
          <div className={styles.appSidebarFooterActions}>
            <ThemeToggle />
            <SessionResetButton />
            <RefreshButton />
          </div>
        )}
        {!collapsed && <TimeZoneNavControl />}
      </div>
    </div>
  );
}

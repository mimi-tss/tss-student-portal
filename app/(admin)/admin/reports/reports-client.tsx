"use client";

import { useEffect, useState } from "react";
import styles from "../../admin.module.css";

interface Coach {
  id: string;
  name: string;
}

interface ReportsCoachRow {
  id: string;
  name: string;
  students: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
}

interface ReportsSummary {
  activeStudents: number;
  tierBreakdown: { lite: number; suite: number; pro: number; elite: number };
  dncCount: number;
  mrr: number;
  revenueByTier: { tier: string; revenue: number }[];
  utilizationPct: number;
  unpaidPayrollTotal: number;
  coachRows: ReportsCoachRow[];
  tableRevenueTotal: number;
  tableCostTotal: number;
  tableMarginTotal: number;
  tableMarginPct: number;
  unassignedRevenue: number;
  unbookedTrials: number;
}

const TIER_COLORS: Record<string, string> = {
  lite: "var(--border)",
  suite: "var(--gold)",
  pro: "#4c8fd6",
  elite: "#d4a24e",
};

function money(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function monthToDateRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
}

export default function ReportsClient({ coaches }: { coaches: Coach[] }) {
  const defaultRange = monthToDateRange();
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [selectedCoachIds, setSelectedCoachIds] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<ReportsSummary | null>(null);

  function toggleCoach(id: string) {
    const next = new Set(selectedCoachIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedCoachIds(next);
  }

  const periodStart = new Date(`${startDate}T00:00:00Z`).toISOString();
  const periodEnd = new Date(`${endDate}T23:59:59.999Z`).toISOString();

  useEffect(() => {
    setSummary(null);
    const params = new URLSearchParams({ start: periodStart, end: periodEnd });
    if (selectedCoachIds.size > 0) params.set("coachIds", Array.from(selectedCoachIds).join(","));
    fetch(`/api/admin/reports/summary?${params}`)
      .then((res) => res.json())
      .then((data) => setSummary(data))
      .catch(() => setSummary(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodStart, periodEnd, selectedCoachIds]);

  const scopeLabel =
    selectedCoachIds.size === 0
      ? "all coaches"
      : selectedCoachIds.size === 1
        ? (coaches.find((c) => c.id === Array.from(selectedCoachIds)[0])?.name ?? "1 coach")
        : `${selectedCoachIds.size} coaches`;

  return (
    <div>
      <div className={styles.pageHeadRow}>
        <h1 className={styles.pageTitle}>Reports</h1>
        <span className={styles.badge}>Finance &amp; admin only</span>
      </div>

      <div className={styles.panel}>
        <h2>Filters</h2>
        <div className={styles.rowForm} style={{ marginBottom: 14 }}>
          <div className={styles.field}>
            <label htmlFor="reports-start">Start</label>
            <input
              id="reports-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="reports-end">End</label>
            <input
              id="reports-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={styles.input}
            />
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            onClick={() => setSelectedCoachIds(new Set())}
            className={`${styles.lifecycleBtn} ${selectedCoachIds.size === 0 ? styles.lifecycleBtnActive : ""}`}
            style={{ flex: "0 1 auto" }}
          >
            All coaches
          </button>
          {coaches.map((c) => (
            <button
              key={c.id}
              onClick={() => toggleCoach(c.id)}
              className={`${styles.lifecycleBtn} ${selectedCoachIds.has(c.id) ? styles.lifecycleBtnActive : ""}`}
              style={{ flex: "0 1 auto" }}
              title="Click to toggle — pick as many coaches as you want to compare together"
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {summary === null ? (
        <div className={styles.panel}>
          <p className={styles.mutedText}>Loading…</p>
        </div>
      ) : (
        <>
          <div className={styles.statCardsRow}>
            <div className={styles.overviewCard}>
              <div className={styles.overviewCardLabel}>Active students</div>
              <div className={styles.overviewCardValue}>{summary.activeStudents}</div>
              <div className={styles.overviewCardSub}>Right now, {scopeLabel}</div>
            </div>
            <div className={styles.overviewCard}>
              <div className={styles.overviewCardLabel}>MRR (list price est.)</div>
              <div className={styles.overviewCardValue}>{money(summary.mrr)}</div>
              <div className={styles.overviewCardSub}>Before multi-month prepay discounts — see note below</div>
            </div>
            <div className={styles.overviewCard}>
              <div className={styles.overviewCardLabel}>DNC — payment hold</div>
              <div className={`${styles.overviewCardValue} ${styles.overviewCardValueWarn}`}>{summary.dncCount}</div>
            </div>
            <div className={styles.overviewCard}>
              <div className={styles.overviewCardLabel}>Coach utilization</div>
              <div className={styles.overviewCardValue}>{summary.utilizationPct}%</div>
              <div className={styles.overviewCardSub}>Selected range, {scopeLabel}</div>
            </div>
          </div>

          <div className={styles.statCardsRow}>
            <div className={styles.overviewCard}>
              <div className={styles.overviewCardLabel}>Gross margin</div>
              <div className={styles.overviewCardValue}>{summary.tableMarginPct}%</div>
              <div className={styles.overviewCardSub}>
                {money(summary.tableRevenueTotal)} revenue − {money(summary.tableCostTotal)} payroll cost, selected
                range
              </div>
            </div>
            <div className={styles.overviewCard}>
              <div className={styles.overviewCardLabel}>Outstanding unpaid payroll</div>
              <div
                className={`${styles.overviewCardValue} ${summary.unpaidPayrollTotal > 0 ? styles.overviewCardValueWarn : ""}`}
              >
                {money(summary.unpaidPayrollTotal)}
              </div>
              <div className={styles.overviewCardSub}>Finalized entries not yet marked Paid, selected range</div>
            </div>
            <div className={styles.overviewCard} style={{ opacity: 0.75 }}>
              <div className={styles.overviewCardLabel}>Avg. customer LTV</div>
              <div className={styles.overviewCardValue}>—</div>
              <div className={styles.overviewCardSub}>
                <span className={styles.badgeWarn}>Needs setup</span>
              </div>
            </div>
            <div className={styles.overviewCard} style={{ opacity: 0.75 }}>
              <div className={styles.overviewCardLabel}>Trial → paid conversion</div>
              <div className={styles.overviewCardValue}>—</div>
              <div className={styles.overviewCardSub}>
                {summary.unbookedTrials} trial{summary.unbookedTrials === 1 ? "" : "s"} pending, org-wide ·{" "}
                <span className={styles.badgeWarn}>Needs setup</span>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <h2>Revenue by tier</h2>
            <div className={styles.tierBar}>
              {summary.revenueByTier.map(({ tier, revenue }) => (
                <div
                  key={tier}
                  className={styles.tierBarSegment}
                  style={{ width: summary.mrr > 0 ? `${(revenue / summary.mrr) * 100}%` : 0, background: TIER_COLORS[tier] }}
                />
              ))}
            </div>
            <div className={styles.tierLegend}>
              {summary.revenueByTier.map(({ tier, revenue }) => (
                <span key={tier}>
                  <span className={styles.tierLegendDot} style={{ background: TIER_COLORS[tier] }} />
                  {tier[0].toUpperCase() + tier.slice(1)} {money(revenue)}
                </span>
              ))}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
              <h2 style={{ margin: 0 }}>Revenue per coach vs. cost per coach</h2>
              <a href="/admin/finance" className={styles.linkBtnSmall}>
                Full payroll →
              </a>
            </div>
            <p className={styles.panelText} style={{ marginBottom: 12 }}>
              Selected range. Revenue is the current active roster&apos;s monthly list price, not cash actually
              collected in this range.
            </p>
            {summary.coachRows.length === 0 ? (
              <p className={styles.emptyState}>No coaches in this selection.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Coach</th>
                    <th>Students</th>
                    <th>Revenue</th>
                    <th>Payroll cost</th>
                    <th>Margin</th>
                    <th>Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.coachRows.map((r) => (
                    <tr key={r.id}>
                      <td className={styles.rowName}>{r.name}</td>
                      <td className={styles.mutedText}>{r.students}</td>
                      <td className={styles.mutedText}>{money(r.revenue)}</td>
                      <td className={styles.mutedText}>{money(r.cost)}</td>
                      <td className={styles.mutedText}>{money(r.margin)}</td>
                      <td className={styles.mutedText}>{r.marginPct}%</td>
                    </tr>
                  ))}
                  {summary.unassignedRevenue > 0 && (
                    <tr>
                      <td className={styles.mutedText}>Unassigned students</td>
                      <td className={styles.mutedText}>—</td>
                      <td className={styles.mutedText}>{money(summary.unassignedRevenue)}</td>
                      <td className={styles.mutedText}>—</td>
                      <td className={styles.mutedText}>—</td>
                      <td className={styles.mutedText}>—</td>
                    </tr>
                  )}
                  <tr className={styles.totalRow}>
                    <td colSpan={2}>Total</td>
                    <td>{money(summary.tableRevenueTotal)}</td>
                    <td>{money(summary.tableCostTotal)}</td>
                    <td>{money(summary.tableMarginTotal)}</td>
                    <td>{summary.tableMarginPct}%</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <div className={styles.panel}>
        <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>Cohort retention</h2>
          <span className={styles.badgeWarn}>Needs setup</span>
        </div>
        <p className={styles.panelText}>
          % of each signup cohort still active, by month since joining. Needs a monthly active-student snapshot
          table this app doesn&apos;t keep yet — right now it only knows a student&apos;s <em>current</em>
          subscription_status, not a history of it month over month. To build: a small cron-written table
          (student_id, month, was_active) populated on the same schedule as the recurring-materialize cron, then
          this table becomes a real query instead of a placeholder. Not affected by the filters above — it&apos;ll
          need its own cohort/coach scoping once built.
        </p>
      </div>

      <div className={styles.panel}>
        <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>Trial → paid funnel</h2>
          <span className={styles.badgeWarn}>Needs setup</span>
        </div>
        <p className={styles.panelText}>
          Suite signups → trial booked → trial attended → upgraded to Pro, as a conversion funnel over time. What
          exists today (the pending-trial count above, from the same entitlements table Overview&apos;s stat card
          reads) is a snapshot, not a funnel — there&apos;s no event log of when a trial was booked/attended/
          converted, so historical conversion rate can&apos;t be computed yet, and a not-yet-booked trial has no
          coach to filter by either. To build: log a timestamped event at each stage instead of only keeping the
          current entitlement row.
        </p>
      </div>
    </div>
  );
}

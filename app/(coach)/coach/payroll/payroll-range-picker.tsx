"use client";

import { useState } from "react";
import { FormattedDateTime } from "@/components/formatted-time";
import { formatPeriodDate } from "@/lib/payroll/period";
import { zonedTimeToUtc } from "@/lib/timezone";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import styles from "../../coach.module.css";

interface PayableSession {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  studentName: string;
  amount: number;
}

interface Estimate {
  coachId: string;
  coachName: string;
  hourlyRate: number;
  salaryAmount?: number;
  sessions: PayableSession[];
  total: number;
}

interface FinalizedEntry {
  id: string;
  amount: number;
  periodStart: string;
  periodEnd: string;
  paid: boolean;
  scheduledAt: string | null;
  label: string;
  isManual: boolean;
  status?: string | null;
}

// Why a lesson pays, in plain words — late cancels and no-shows still
// pay the coach (lib/payroll/calculate.ts PAID_STATUSES).
const STATUS_LABEL: Record<string, string> = {
  attended: "Attended",
  "no-show": "No-show (paid)",
  "late-forfeit": "Late cancel (paid)",
  "cancelled-no-notice": "Late cancel (paid)",
  occurred: "Group class",
};

function toDateInputValue(iso: string) {
  return iso.slice(0, 10);
}

// "To" is inclusive for the coach (Sep 1 – Sep 30), while periods are
// stored with an exclusive end (Oct 1) — shift by a day each way.
function shiftDate(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function money(n: number) {
  return n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
}

export default function PayrollRangePicker({
  hourlyRate,
  monthlySalary = null,
  initialPeriodStart,
  initialPeriodEnd,
  initialEstimate,
  initialFinalized,
}: {
  hourlyRate: number;
  monthlySalary?: number | null;
  initialPeriodStart: string;
  initialPeriodEnd: string;
  initialEstimate: Estimate;
  initialFinalized: FinalizedEntry[];
}) {
  const [start, setStart] = useState(toDateInputValue(initialPeriodStart));
  const [end, setEnd] = useState(shiftDate(toDateInputValue(initialPeriodEnd), -1));
  const [estimate, setEstimate] = useState(initialEstimate);
  const [finalized, setFinalized] = useState(initialFinalized);
  const [loading, setLoading] = useState(false);
  // The range actually loaded (inputs can be edited without Apply) —
  // what the PDF statement's header shows.
  const [applied, setApplied] = useState({ start, end });

  // Browser print → "Save as PDF". Only the [data-print-area] block
  // prints (app/globals.css); the title becomes the suggested filename.
  function downloadPdf() {
    const previousTitle = document.title;
    document.title = `Pay statement - ${estimate.coachName} - ${formatPeriodDate(applied.start)} to ${formatPeriodDate(applied.end)}`.replace(/\//g, "-");
    const restore = () => {
      document.title = previousTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  async function handleApply() {
    setLoading(true);
    // Eastern midnight, not UTC midnight — a UTC boundary starts 4-5
    // hours before the studio's own day actually turns over.
    const [sy, sm, sd] = start.split("-").map(Number);
    const [ey, em, ed] = shiftDate(end, 1).split("-").map(Number);
    const startIso = zonedTimeToUtc(sy, sm, sd, 0, 0, DEFAULT_TIMEZONE).toISOString();
    const endIso = zonedTimeToUtc(ey, em, ed, 0, 0, DEFAULT_TIMEZONE).toISOString();
    const res = await fetch(`/api/coach/payroll?start=${startIso}&end=${endIso}`);
    if (res.ok) {
      const data = await res.json();
      setEstimate(data.estimate);
      setFinalized(data.finalized ?? []);
      setApplied({ start, end });
    }
    setLoading(false);
  }

  return (
    <div>
      <div className={styles.rangeForm}>
        <div className={styles.field}>
          <label htmlFor="payroll-start">From</label>
          <input
            id="payroll-start"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="payroll-end">To</label>
          <input
            id="payroll-end"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={styles.input}
          />
        </div>
        <button onClick={handleApply} disabled={loading} className={styles.cta}>
          {loading ? "Loading…" : "Apply"}
        </button>
        <button onClick={downloadPdf} className={styles.cta}>
          Download PDF
        </button>
      </div>

      <div data-print-area>
      {/* Statement header — only on the printed PDF. */}
      <div data-print-only style={{ display: "none", marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Tara Simon Studios — Pay statement</h1>
        <p style={{ margin: "4px 0 0" }}>
          {estimate.coachName} · {formatPeriodDate(applied.start)} – {formatPeriodDate(applied.end)}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 12 }}>Printed {formatPeriodDate(new Date().toISOString())}</p>
      </div>

      <div className={styles.panel} {...(finalized.length > 0 ? { "data-no-print": true } : {})}>
        <h2>Estimate for this period</h2>
        <p className={styles.panelText}>
          {estimate.coachName} ·{" "}
          {monthlySalary !== null
            ? `${money(monthlySalary)}/month fixed — this period: ${money(estimate.salaryAmount ?? 0)}`
            : `$${hourlyRate.toFixed(2)}/hr`}
        </p>
        {estimate.sessions.length === 0 ? (
          <p className={styles.emptyState}>No payable sessions in this range.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Student</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {estimate.sessions.map((s) => (
                <tr key={s.id}>
                  <td>
                    <FormattedDateTime value={s.scheduledAt} />
                  </td>
                  <td>{s.studentName}</td>
                  <td>{STATUS_LABEL[s.status] ?? s.status}</td>
                  <td>{s.durationMinutes} min</td>
                  <td>${s.amount.toFixed(2)}</td>
                </tr>
              ))}
              <tr className={styles.totalRow}>
                <td colSpan={4}>Estimated total</td>
                <td>${estimate.total.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.panel}>
        <h2>Finalized pay runs</h2>
        <p className={styles.panelText}>
          Entries admin has already generated and locked in for this range, including any bonuses or
          deductions — this total is what you&apos;ll be paid. The estimate above covers lessons only.
        </p>
        {finalized.length === 0 ? (
          <p className={styles.emptyState}>Nothing finalized yet for this range.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Details</th>
                <th>Lesson</th>
                <th>Pay period</th>
                <th>Amount</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {/* Oldest lesson first; adjustments (no lesson date) on top. */}
              {[...finalized]
                .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""))
                .map((f) => (
                <tr key={f.id}>
                  <td>{f.scheduledAt ? <FormattedDateTime value={f.scheduledAt} /> : "—"}</td>
                  <td>
                    {f.label}
                    {f.isManual && (
                      <span className={styles.badge} style={{ marginLeft: 8, fontSize: 10 }}>
                        adjustment
                      </span>
                    )}
                  </td>
                  <td>{f.status ? (STATUS_LABEL[f.status] ?? f.status) : f.isManual ? "—" : "Group class"}</td>
                  <td>
                    {formatPeriodDate(f.periodStart)} – {formatPeriodDate(f.periodEnd, true)}
                  </td>
                  <td style={f.amount < 0 ? { color: "var(--coral)" } : undefined}>{money(Number(f.amount))}</td>
                  <td>
                    <span className={f.paid ? styles.badge : styles.badgeMuted}>
                      {f.paid ? "Paid" : "Pending"}
                    </span>
                  </td>
                </tr>
              ))}
              <tr className={styles.totalRow}>
                <td colSpan={4}>Total</td>
                <td>{money(finalized.reduce((sum, f) => sum + Number(f.amount), 0))}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </div>
      </div>
    </div>
  );
}

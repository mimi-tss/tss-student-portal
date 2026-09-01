"use client";

import { useState } from "react";
import { FormattedDate, FormattedDateTime } from "@/components/formatted-time";
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
}

function toDateInputValue(iso: string) {
  return iso.slice(0, 10);
}

function money(n: number) {
  return n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
}

export default function PayrollRangePicker({
  hourlyRate,
  initialPeriodStart,
  initialPeriodEnd,
  initialEstimate,
  initialFinalized,
}: {
  hourlyRate: number;
  initialPeriodStart: string;
  initialPeriodEnd: string;
  initialEstimate: Estimate;
  initialFinalized: FinalizedEntry[];
}) {
  const [start, setStart] = useState(toDateInputValue(initialPeriodStart));
  const [end, setEnd] = useState(toDateInputValue(initialPeriodEnd));
  const [estimate, setEstimate] = useState(initialEstimate);
  const [finalized, setFinalized] = useState(initialFinalized);
  const [loading, setLoading] = useState(false);

  async function handleApply() {
    setLoading(true);
    // Eastern midnight, not UTC midnight — a UTC boundary starts 4-5
    // hours before the studio's own day actually turns over.
    const [sy, sm, sd] = start.split("-").map(Number);
    const [ey, em, ed] = end.split("-").map(Number);
    const startIso = zonedTimeToUtc(sy, sm, sd, 0, 0, DEFAULT_TIMEZONE).toISOString();
    const endIso = zonedTimeToUtc(ey, em, ed, 0, 0, DEFAULT_TIMEZONE).toISOString();
    const res = await fetch(`/api/coach/payroll?start=${startIso}&end=${endIso}`);
    if (res.ok) {
      const data = await res.json();
      setEstimate(data.estimate);
      setFinalized(data.finalized ?? []);
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
      </div>

      <div className={styles.panel}>
        <h2>Estimate for this period</h2>
        <p className={styles.panelText}>
          {estimate.coachName} · ${hourlyRate.toFixed(2)}/hr
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
                  <td>{s.status}</td>
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
          Entries admin has already generated and locked in for this range.
        </p>
        {finalized.length === 0 ? (
          <p className={styles.emptyState}>Nothing finalized yet for this range.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Details</th>
                <th>Pay period</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {finalized.map((f) => (
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
                  <td>
                    <FormattedDate value={f.periodStart} /> – <FormattedDate value={f.periodEnd} />
                  </td>
                  <td style={f.amount < 0 ? { color: "var(--coral)" } : undefined}>{money(Number(f.amount))}</td>
                  <td>
                    <span className={f.paid ? styles.badge : styles.badgeMuted}>
                      {f.paid ? "Paid" : "Pending"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

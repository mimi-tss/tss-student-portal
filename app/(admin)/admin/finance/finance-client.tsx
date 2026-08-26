"use client";

import { Fragment, useEffect, useState } from "react";
import styles from "../../admin.module.css";

interface Coach {
  id: string;
  name: string;
  hourly_rate: number;
}

interface PayableSession {
  id: string;
  type: "session" | "group-lesson";
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  studentName: string;
  amount: number;
  isReferralBonus: boolean;
}

interface CoachPayrollSummary {
  coachId: string;
  coachName: string;
  hourlyRate: number;
  sessions: PayableSession[];
  total: number;
}

interface HistoryEntry {
  id: string;
  coachName: string;
  scheduledAt: string | null;
  type: string;
  label: string;
  durationMinutes: number;
  amount: number;
  paid: boolean;
  isManual: boolean;
}

interface CoachUnrecordedAttendance {
  coachId: string;
  coachName: string;
  sessions: { id: string; scheduledAt: string; studentName: string }[];
}

interface GeneratedRunCoachSummary {
  coachId: string;
  coachName: string;
  entries: number;
  total: number;
}

interface GenerateResult {
  inserted: number;
  skippedAlreadyPaid: number;
  perCoach: GeneratedRunCoachSummary[];
}

function ModalOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "56px 16px",
        overflowY: "auto",
        zIndex: 1000,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, width: "100%" }}>
        {children}
      </div>
    </div>
  );
}

// Payroll always runs on the 1st for the *previous* full calendar
// month (e.g. running it Sep 1 reviews Aug 1–31) — not month-to-date,
// which was the old default before this was a monthly-close workflow.
function previousMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function money(n: number) {
  return n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
}

function CoachRateRow({ coach }: { coach: Coach }) {
  const [saved, setSaved] = useState(coach.hourly_rate);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(coach.hourly_rate));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setSaving(true);
    const res = await fetch("/api/admin/coach-rate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coachId: coach.id, hourlyRate: parsed }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(parsed);
      setEditing(false);
    }
  }

  return (
    <tr>
      <td className={styles.rowName}>{coach.name}</td>
      <td>
        {!editing ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            ${saved.toFixed(2)}/hr
            <button onClick={() => setEditing(true)} className={styles.linkBtnSmall}>
              Edit
            </button>
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <input
              type="number"
              min={0}
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={saving}
              className={styles.inputSmall}
              style={{ width: 80 }}
            />
            <button onClick={handleSave} disabled={saving} className={styles.linkBtnSmall}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => {
                setValue(String(saved));
                setEditing(false);
              }}
              disabled={saving}
              className={styles.linkBtnSmall}
            >
              Cancel
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}

export default function FinanceClient({ coaches }: { coaches: Coach[] }) {
  const defaultRange = previousMonthRange();
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [coachId, setCoachId] = useState("");

  const [summaries, setSummaries] = useState<CoachPayrollSummary[] | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [expandedCoach, setExpandedCoach] = useState<string | null>(null);

  const [attendance, setAttendance] = useState<CoachUnrecordedAttendance[] | null>(null);
  const [notifying, setNotifying] = useState(false);
  const [notifyResult, setNotifyResult] = useState<{ coachCount: number; sessionCount: number } | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [marking, setMarking] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const [adjCoachId, setAdjCoachId] = useState("");
  const [adjKind, setAdjKind] = useState<"bonus" | "deduction">("bonus");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [addingAdjustment, setAddingAdjustment] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);

  const periodStart = new Date(`${startDate}T00:00:00Z`).toISOString();
  const periodEnd = new Date(`${endDate}T00:00:00Z`).toISOString();

  function loadRollup() {
    fetch(`/api/admin/payroll/rollup?start=${periodStart}&end=${periodEnd}`)
      .then((res) => res.json())
      .then((data) => setSummaries(data.summaries ?? []))
      .catch(() => setSummaries([]));
  }

  function loadHistory() {
    const params = new URLSearchParams({ start: periodStart, end: periodEnd });
    if (coachId) params.set("coachId", coachId);
    fetch(`/api/admin/payroll/history?${params}`)
      .then((res) => res.json())
      .then((data) => setHistory(data.entries ?? []))
      .catch(() => setHistory([]));
  }

  function loadAttendance() {
    const params = new URLSearchParams({ start: periodStart, end: periodEnd });
    if (coachId) params.set("coachId", coachId);
    fetch(`/api/admin/payroll/unrecorded-attendance?${params}`)
      .then((res) => res.json())
      .then((data) => setAttendance(data.coaches ?? []))
      .catch(() => setAttendance([]));
  }

  useEffect(() => {
    loadRollup();
    loadHistory();
    loadAttendance();
    setGenerateResult(null);
    setNotifyResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, coachId]);

  const visibleSummaries = coachId ? (summaries ?? []).filter((s) => s.coachId === coachId) : summaries ?? [];
  const grandTotal = visibleSummaries.reduce((sum, s) => sum + s.total, 0);

  const finalizedTotal = (history ?? []).reduce((sum, e) => sum + e.amount, 0);
  const unpaidTotal = (history ?? []).filter((e) => !e.paid).reduce((sum, e) => sum + e.amount, 0);
  const paidTotal = finalizedTotal - unpaidTotal;

  const unrecordedCount = (attendance ?? []).reduce((sum, c) => sum + c.sessions.length, 0);

  async function handleGenerate() {
    setGenerating(true);
    const res = await fetch("/api/admin/payroll/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodStart, periodEnd, coachId: coachId || undefined }),
    });
    setGenerating(false);
    setConfirming(false);

    if (res.ok) {
      const result = await res.json();
      setGenerateResult(result);
      loadHistory();
    }
  }

  async function handleMarkPaid(entryId: string, paid: boolean) {
    setMarking(entryId);
    const res = await fetch("/api/admin/payroll/mark-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId, paid }),
    });
    setMarking(null);
    if (res.ok) {
      setHistory((prev) => (prev ? prev.map((e) => (e.id === entryId ? { ...e, paid } : e)) : prev));
    }
  }

  async function handleAddAdjustment() {
    setAdjustmentError(null);
    const parsed = Number(adjAmount);
    if (!adjCoachId || !Number.isFinite(parsed) || parsed <= 0 || !adjReason.trim()) {
      setAdjustmentError("Coach, a positive amount, and a reason are all required.");
      return;
    }
    setAddingAdjustment(true);
    const res = await fetch("/api/admin/payroll/add-adjustment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coachId: adjCoachId,
        amount: adjKind === "deduction" ? -parsed : parsed,
        reason: adjReason.trim(),
        periodStart,
        periodEnd,
      }),
    });
    setAddingAdjustment(false);
    if (res.ok) {
      setAdjAmount("");
      setAdjReason("");
      loadHistory();
    } else {
      const body = await res.json().catch(() => null);
      setAdjustmentError(body?.error ?? "Something went wrong — try again.");
    }
  }

  async function handleRemoveAdjustment(entryId: string) {
    setRemoving(entryId);
    const res = await fetch("/api/admin/payroll/remove-adjustment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId }),
    });
    setRemoving(null);
    if (res.ok) {
      setHistory((prev) => (prev ? prev.filter((e) => e.id !== entryId) : prev));
    }
  }

  async function handleNotify() {
    setNotifying(true);
    const res = await fetch("/api/admin/payroll/notify-attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodStart, periodEnd, coachId: coachId || undefined }),
    });
    setNotifying(false);
    if (res.ok) {
      const result = await res.json();
      setNotifyResult(result);
    }
  }

  const exportParams = new URLSearchParams({ start: periodStart, end: periodEnd });
  if (coachId) exportParams.set("coachId", coachId);

  return (
    <div>
      <div className={styles.statCardsRow}>
        <div className={styles.overviewCard}>
          <div className={styles.overviewCardLabel}>Live rollup — this range</div>
          <div className={styles.overviewCardValue}>${grandTotal.toFixed(2)}</div>
          <div className={styles.overviewCardSub}>Not yet frozen into a payroll run</div>
        </div>
        <div className={styles.overviewCard}>
          <div className={styles.overviewCardLabel}>Finalized — this range</div>
          <div className={styles.overviewCardValue}>{money(finalizedTotal)}</div>
          <div className={styles.overviewCardSub}>
            {history?.length ?? 0} entr{(history?.length ?? 0) === 1 ? "y" : "ies"}
          </div>
        </div>
        <div className={styles.overviewCard}>
          <div className={styles.overviewCardLabel}>Paid</div>
          <div className={styles.overviewCardValue}>{money(paidTotal)}</div>
        </div>
        <div className={styles.overviewCard}>
          <div className={styles.overviewCardLabel}>Unpaid</div>
          <div className={`${styles.overviewCardValue} ${unpaidTotal > 0 ? styles.overviewCardValueWarn : ""}`}>
            {money(unpaidTotal)}
          </div>
        </div>
      </div>

      <div className={styles.panel}>
        <h2>Date range</h2>
        <div className={styles.rowForm}>
          <div className={styles.field}>
            <label htmlFor="payroll-start">Start</label>
            <input
              id="payroll-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="payroll-end">End</label>
            <input
              id="payroll-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="payroll-coach">Coach</label>
            <select
              id="payroll-coach"
              value={coachId}
              onChange={(e) => setCoachId(e.target.value)}
              className={styles.select}
            >
              <option value="">All coaches</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <a
            href={`/api/admin/payroll/export?${exportParams}`}
            className={styles.btnGhost}
            style={{ textDecoration: "none" }}
          >
            Export CSV
          </a>
        </div>
      </div>

      <div className={styles.panel}>
        <h2>Attendance check</h2>
        {attendance === null ? (
          <p className={styles.mutedText}>Loading…</p>
        ) : unrecordedCount === 0 ? (
          <p className={styles.successText}>Every session in this range has attendance recorded.</p>
        ) : (
          <>
            <p className={styles.panelText}>
              {unrecordedCount} session{unrecordedCount === 1 ? "" : "s"} across {attendance.length} coach
              {attendance.length === 1 ? "" : "es"} still need attendance marked — until then, they won&apos;t be
              included in the payroll run below.
            </p>
            <ul className={styles.list} style={{ margin: "12px 0" }}>
              {attendance.map((c) => (
                <li key={c.coachId} className={styles.listItem} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className={styles.rowName}>{c.coachName}</span>
                  <span className={styles.mutedText}>
                    {c.sessions.length} session{c.sessions.length === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
            <button onClick={handleNotify} disabled={notifying} className={styles.ctaSmall}>
              {notifying ? "Notifying…" : "Notify coaches"}
            </button>
            {notifyResult && (
              <p className={styles.successText} style={{ marginTop: 8 }}>
                Slack message sent — {notifyResult.coachCount} coach{notifyResult.coachCount === 1 ? "" : "es"},{" "}
                {notifyResult.sessionCount} session{notifyResult.sessionCount === 1 ? "" : "s"}.
              </p>
            )}
          </>
        )}
      </div>

      <div className={styles.panel}>
        <h2>Live rollup — this range</h2>
        {summaries === null ? (
          <p className={styles.mutedText}>Loading…</p>
        ) : visibleSummaries.length === 0 ? (
          <p className={styles.emptyState}>No payable sessions in this range.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Coach</th>
                <th>Rate</th>
                <th>Sessions</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {visibleSummaries.map((s) => (
                <Fragment key={s.coachId}>
                  <tr
                    onClick={() => setExpandedCoach(expandedCoach === s.coachId ? null : s.coachId)}
                    style={{ cursor: "pointer" }}
                  >
                    <td className={styles.rowName}>{s.coachName}</td>
                    <td className={styles.mutedText}>${s.hourlyRate.toFixed(2)}/hr</td>
                    <td className={styles.mutedText}>{s.sessions.length}</td>
                    <td>${s.total.toFixed(2)}</td>
                  </tr>
                  {expandedCoach === s.coachId &&
                    s.sessions.map((sess) => (
                      <tr key={sess.id}>
                        <td colSpan={2} className={styles.mutedText} style={{ paddingLeft: 24 }}>
                          {new Date(sess.scheduledAt).toLocaleString()} — {sess.studentName}
                          {sess.isReferralBonus && (
                            <span className={styles.badge} style={{ marginLeft: 8, fontSize: 10 }}>
                              referral +$10/hr
                            </span>
                          )}
                        </td>
                        <td className={styles.mutedText}>{sess.durationMinutes} min</td>
                        <td className={styles.mutedText}>${sess.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                </Fragment>
              ))}
              <tr className={styles.totalRow}>
                <td colSpan={3}>Grand total</td>
                <td>${grandTotal.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 16 }}>
          {!confirming ? (
            <button onClick={() => setConfirming(true)} className={styles.cta} disabled={generating}>
              Generate payroll run
            </button>
          ) : (
            <div className={styles.panel} style={{ background: "var(--surface-2)" }}>
              <p className={styles.panelText}>
                This freezes the rollup above into real payroll_entries rows for{" "}
                {startDate} – {endDate}
                {coachId ? ` (${coaches.find((c) => c.id === coachId)?.name} only)` : " (all coaches)"}.
                Sessions already paid out in an earlier run are skipped automatically. Confirm?
              </p>
              {unrecordedCount > 0 && (
                <div className={styles.warnPanel}>
                  {unrecordedCount} session{unrecordedCount === 1 ? "" : "s"} in this range still don&apos;t have
                  attendance recorded — they&apos;ll be excluded from this run until marked.
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button onClick={handleGenerate} disabled={generating} className={styles.cta}>
                  {generating ? "Generating…" : "Confirm — generate run"}
                </button>
                <button onClick={() => setConfirming(false)} className={styles.btnGhost}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {generateResult && (
        <ModalOverlay onClose={() => setGenerateResult(null)}>
          <div className={styles.panel} style={{ marginBottom: 0 }}>
            <h2>Payroll run generated</h2>
            <p className={styles.panelText} style={{ marginBottom: 12 }}>
              {generateResult.inserted} entr{generateResult.inserted === 1 ? "y" : "ies"} added for {startDate} –{" "}
              {endDate}
              {generateResult.skippedAlreadyPaid > 0
                ? ` (${generateResult.skippedAlreadyPaid} already existed and were skipped)`
                : ""}
              . Each coach below will see their share flagged as new payroll on their own dashboard.
            </p>
            {generateResult.perCoach.length === 0 ? (
              <p className={styles.emptyState}>Nothing new to report — every entry already existed.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Coach</th>
                    <th>Entries</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {generateResult.perCoach.map((c) => (
                    <tr key={c.coachId}>
                      <td className={styles.rowName}>{c.coachName}</td>
                      <td className={styles.mutedText}>{c.entries}</td>
                      <td>{money(c.total)}</td>
                    </tr>
                  ))}
                  <tr className={styles.totalRow}>
                    <td colSpan={2}>Total</td>
                    <td>{money(generateResult.perCoach.reduce((s, c) => s + c.total, 0))}</td>
                  </tr>
                </tbody>
              </table>
            )}
            <button onClick={() => setGenerateResult(null)} className={styles.cta} style={{ marginTop: 16 }}>
              Done
            </button>
          </div>
        </ModalOverlay>
      )}

      <div className={styles.panel}>
        <h2>Add adjustment</h2>
        <p className={styles.panelText} style={{ marginBottom: 12 }}>
          A one-off bonus or deduction for a coach — not tied to any session, so it skips the rollup above and
          goes straight into Finalized entries below, filed under the date range currently selected ({startDate} –{" "}
          {endDate}).
        </p>
        <div className={styles.rowForm}>
          <div className={styles.field}>
            <label htmlFor="adj-coach">Coach</label>
            <select
              id="adj-coach"
              value={adjCoachId}
              onChange={(e) => setAdjCoachId(e.target.value)}
              className={styles.select}
            >
              <option value="" disabled>
                Select a coach
              </option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="adj-kind">Type</label>
            <select
              id="adj-kind"
              value={adjKind}
              onChange={(e) => setAdjKind(e.target.value as "bonus" | "deduction")}
              className={styles.select}
            >
              <option value="bonus">Bonus (+)</option>
              <option value="deduction">Deduction (−)</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="adj-amount">Amount</label>
            <input
              id="adj-amount"
              type="number"
              min={0}
              step="0.01"
              value={adjAmount}
              onChange={(e) => setAdjAmount(e.target.value)}
              className={styles.input}
              style={{ width: 100 }}
            />
          </div>
          <div className={styles.field} style={{ flex: 1, minWidth: 200 }}>
            <label htmlFor="adj-reason">Reason</label>
            <input
              id="adj-reason"
              type="text"
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              placeholder="e.g. Covered a shift for Priya"
              className={styles.input}
              style={{ width: "100%" }}
            />
          </div>
          <button onClick={handleAddAdjustment} disabled={addingAdjustment} className={styles.cta}>
            {addingAdjustment ? "Adding…" : "Add"}
          </button>
        </div>
        {adjustmentError && (
          <p className={styles.errorText} style={{ marginTop: 8 }}>
            {adjustmentError}
          </p>
        )}
      </div>

      <div className={styles.panel}>
        <h2>Finalized entries — this range</h2>
        {history === null ? (
          <p className={styles.mutedText}>Loading…</p>
        ) : history.length === 0 ? (
          <p className={styles.emptyState}>No finalized entries yet for this range.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Coach</th>
                <th>Date</th>
                <th>Details</th>
                <th>Amount</th>
                <th>Paid</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((e) => (
                <tr key={e.id}>
                  <td className={styles.rowName}>{e.coachName}</td>
                  <td className={styles.mutedText}>{e.scheduledAt ? new Date(e.scheduledAt).toLocaleString() : "—"}</td>
                  <td className={styles.mutedText}>
                    {e.label}
                    {e.isManual && (
                      <span className={styles.badge} style={{ marginLeft: 8, fontSize: 10 }}>
                        adjustment
                      </span>
                    )}
                  </td>
                  <td style={e.amount < 0 ? { color: "var(--coral)" } : undefined}>{money(e.amount)}</td>
                  <td>
                    <button
                      onClick={() => handleMarkPaid(e.id, !e.paid)}
                      disabled={marking === e.id}
                      className={e.paid ? styles.badge : styles.badgeMuted}
                      style={{ border: "none", cursor: "pointer", font: "inherit" }}
                    >
                      {e.paid ? "Paid" : "Unpaid"}
                    </button>
                  </td>
                  <td>
                    {e.isManual && (
                      <button
                        onClick={() => handleRemoveAdjustment(e.id)}
                        disabled={removing === e.id}
                        className={styles.dangerLink}
                      >
                        {removing === e.id ? "Removing…" : "Remove"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.panel}>
        <h2>Coach rates</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Coach</th>
              <th>Hourly rate</th>
            </tr>
          </thead>
          <tbody>
            {coaches.map((c) => (
              <CoachRateRow key={c.id} coach={c} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

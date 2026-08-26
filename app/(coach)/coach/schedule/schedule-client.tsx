"use client";

import { useCallback, useRef, useState } from "react";
import CoachCalendar from "@/components/coach-calendar";
import { FormattedDateTime } from "@/components/formatted-time";
import styles from "../../coach.module.css";

interface NeedsAttendanceSession {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  studentName: string;
}

interface NeedsAttendanceGroupLesson {
  registrationId: string;
  scheduledAt: string;
  durationMinutes: number;
  topic: string | null;
  studentName: string;
}

interface PayrollSummary {
  needsAttendanceCount: number;
  needsAttendanceSessions: NeedsAttendanceSession[];
  needsAttendanceGroupLessons: NeedsAttendanceGroupLesson[];
  estimate: { total: number; sessions: { id: string }[] };
}

export default function ScheduleClient() {
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const rangeRef = useRef<{ start: string; end: string } | null>(null);

  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [showNeedsAttendance, setShowNeedsAttendance] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);

  const loadSummary = useCallback((start: Date, end: Date) => {
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    if (rangeRef.current?.start === startIso && rangeRef.current?.end === endIso) return;
    rangeRef.current = { start: startIso, end: endIso };

    fetch(`/api/coach/payroll?start=${startIso}&end=${endIso}`)
      .then((res) => res.json())
      .then(setSummary)
      .catch(() => {});
  }, []);

  async function handleMark(sessionId: string, status: "attended" | "no-show") {
    setMarking(sessionId);
    const res = await fetch("/api/coach/mark-attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, status }),
    });
    setMarking(null);

    if (res.ok) {
      // Remove from the list and drop both counters locally, rather than
      // waiting on a full re-fetch — the calendar grid still needs a
      // real refresh (below) since it has its own copy of this session.
      setSummary((prev) =>
        prev
          ? {
              ...prev,
              needsAttendanceCount: prev.needsAttendanceCount - 1,
              needsAttendanceSessions: prev.needsAttendanceSessions.filter((s) => s.id !== sessionId),
            }
          : prev,
      );
      setRefreshSignal((n) => n + 1);
    }
  }

  async function handleMarkGroup(registrationId: string, status: "attended" | "no-show") {
    setMarking(registrationId);
    const res = await fetch("/api/coach/mark-group-attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationId, status }),
    });
    setMarking(null);

    if (res.ok) {
      setSummary((prev) =>
        prev
          ? {
              ...prev,
              needsAttendanceCount: prev.needsAttendanceCount - 1,
              needsAttendanceGroupLessons: prev.needsAttendanceGroupLessons.filter(
                (r) => r.registrationId !== registrationId,
              ),
            }
          : prev,
      );
      setRefreshSignal((n) => n + 1);
    }
  }

  async function handleAddBlock() {
    if (!startAt || !endAt) {
      setError("Start and end are required.");
      return;
    }
    setSaving(true);
    setError(null);

    const res = await fetch("/api/coach/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        reason: reason.trim() || null,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't add that time off.");
      return;
    }

    setStartAt("");
    setEndAt("");
    setReason("");
    // rangeRef isn't cleared — the calendar's own onRangeChange won't
    // fire again for the same visible range, so bump refreshSignal
    // directly to force it to re-fetch and show the new block.
    setRefreshSignal((n) => n + 1);
  }

  return (
    <div>
      <CoachCalendar
        scheduleEndpoint="/api/coach/schedule"
        canMarkAttendance
        studentLinkBase="/coach/students"
        onRangeChange={loadSummary}
        refreshSignal={refreshSignal}
      />

      <div className={styles.snapshotGrid} style={{ marginTop: 24, gridTemplateColumns: "repeat(3, 1fr)" }}>
        <button
          className={styles.snapshotStat}
          style={{ cursor: "pointer", textAlign: "left", border: "none", font: "inherit" }}
          onClick={() => setShowNeedsAttendance((v) => !v)}
          disabled={!summary?.needsAttendanceCount}
        >
          <div className={styles.snapshotStatLabel}>
            Needs attendance {summary && summary.needsAttendanceCount > 0 ? (showNeedsAttendance ? "▲" : "▼") : ""}
          </div>
          <div className={styles.snapshotStatValue}>{summary?.needsAttendanceCount ?? "—"}</div>
        </button>
        <div className={styles.snapshotStat}>
          <div className={styles.snapshotStatLabel}>Paid sessions this range</div>
          <div className={styles.snapshotStatValue}>{summary?.estimate.sessions.length ?? "—"}</div>
        </div>
        <div className={styles.snapshotStat}>
          <div className={styles.snapshotStatLabel}>Payroll total</div>
          <div className={styles.snapshotStatValue}>
            {summary ? `$${summary.estimate.total.toFixed(2)}` : "—"}
          </div>
        </div>
      </div>

      {showNeedsAttendance &&
        summary &&
        (summary.needsAttendanceSessions.length > 0 || summary.needsAttendanceGroupLessons.length > 0) && (
          <div className={styles.panel} style={{ marginTop: 16 }}>
            <h2>Needs attendance</h2>
            <ul className={styles.list}>
              {summary.needsAttendanceSessions.map((s) => (
                <li
                  key={s.id}
                  className={styles.listItem}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
                >
                  <span>
                    <span className={styles.statValue}>{s.studentName}</span>{" "}
                    <span className={styles.panelText} style={{ display: "inline" }}>
                      — <FormattedDateTime value={s.scheduledAt} /> · {s.durationMinutes} min
                    </span>
                  </span>
                  <span className={styles.quickMark}>
                    <button
                      className={`${styles.quickMarkBtn} ${styles.quickMarkYes}`}
                      onClick={() => handleMark(s.id, "attended")}
                      disabled={marking === s.id}
                      title="Mark attended"
                    >
                      ✓
                    </button>
                    <button
                      className={`${styles.quickMarkBtn} ${styles.quickMarkNo}`}
                      onClick={() => handleMark(s.id, "no-show")}
                      disabled={marking === s.id}
                      title="Mark no-show"
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
              {summary.needsAttendanceGroupLessons.map((r) => (
                <li
                  key={r.registrationId}
                  className={styles.listItem}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
                >
                  <span>
                    <span className={styles.statValue}>{r.studentName}</span>{" "}
                    <span className={styles.panelText} style={{ display: "inline" }}>
                      — {r.topic ?? "Group lesson"} · <FormattedDateTime value={r.scheduledAt} /> ·{" "}
                      {r.durationMinutes} min
                    </span>
                  </span>
                  <span className={styles.quickMark}>
                    <button
                      className={`${styles.quickMarkBtn} ${styles.quickMarkYes}`}
                      onClick={() => handleMarkGroup(r.registrationId, "attended")}
                      disabled={marking === r.registrationId}
                      title="Mark attended"
                    >
                      ✓
                    </button>
                    <button
                      className={`${styles.quickMarkBtn} ${styles.quickMarkNo}`}
                      onClick={() => handleMarkGroup(r.registrationId, "no-show")}
                      disabled={marking === r.registrationId}
                      title="Mark no-show"
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

      <div className={styles.panel} style={{ marginTop: 24 }}>
        <h2>Add time off</h2>
        <div className={styles.rangeForm} style={{ flexWrap: "wrap" }}>
          <div className={styles.field}>
            <label htmlFor="block-start">Start</label>
            <input
              id="block-start"
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="block-end">End</label>
            <input
              id="block-end"
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className={styles.input}
            />
          </div>
          <div className={styles.field} style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="block-reason">Reason</label>
            <input
              id="block-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Event, Meeting, Break"
              className={styles.input}
            />
          </div>
          <button onClick={handleAddBlock} disabled={saving} className={styles.cta}>
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
        {error && <p className={styles.errorText}>{error}</p>}
      </div>
    </div>
  );
}

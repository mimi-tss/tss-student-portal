"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DAY_NAMES } from "@/lib/scheduling/recurring";
import { formatPlainDate } from "@/lib/format-date";
import styles from "../../../admin.module.css";

interface Coach {
  id: string;
  name: string;
}

type Panel = null | "start" | "pause" | "stop";

// Replaces the old always-visible pause-only control with a three-way
// lifecycle bar matching how a student's recurring relationship actually
// moves: Start (set their first weekly slot), Pause (temporary hold),
// Stop (cancellation, self-service-triggered or admin-flagged). Each
// button reveals its own form below rather than any of this being a
// live/always-editable field — same "click to act, not click to
// accidentally change" reasoning as birth-date-client.tsx.
export default function SubscriptionLifecycleClient({
  studentId,
  subscriptionStatus,
  hasCoach,
  hasRecurringSchedule,
  defaultCoachId,
  coachTimeZone,
  coaches,
  pausedStart,
  pausedEnd,
  billingRenewalDate,
  cancelRequest,
  computedLastSession,
}: {
  studentId: string;
  subscriptionStatus: string;
  hasCoach: boolean;
  hasRecurringSchedule: boolean;
  defaultCoachId: string | null;
  coachTimeZone: string | null;
  coaches: Coach[];
  pausedStart: string | null;
  pausedEnd: string | null;
  billingRenewalDate: string;
  cancelRequest: {
    attentionItemId: string | null;
    status: string;
    reason: string | null;
    effectiveDate: string;
    lastSessionOverride: string | null;
  } | null;
  computedLastSession: string | null;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set after a successful Start when the coach already had something
  // else booked at one or more of the new slot's future occurrences —
  // same signal /api/admin/recurring-schedule's own client
  // (recurring-schedule-client.tsx) surfaces for a change/add.
  const [notice, setNotice] = useState<string | null>(null);

  function toggle(p: Panel) {
    setError(null);
    setNotice(null);
    setConfirmingUnpause(false);
    setPanel((cur) => (cur === p ? null : p));
  }

  // ---- Start ----
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState("16:00");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [coachId, setCoachId] = useState(defaultCoachId ?? "");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Missing entirely until now — this panel could only ever start a
  // plain weekly slot, with no way to reach the biweekly cadence
  // recurring-schedule-client.tsx's own Change/Add form already
  // supports, even though /api/admin/recurring-schedule has always
  // accepted it.
  const [cadence, setCadence] = useState<"weekly" | "biweekly">("weekly");

  const canStart = subscriptionStatus === "active" && hasCoach && !hasRecurringSchedule;

  async function handleStart() {
    setSaving(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/admin/recurring-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, dayOfWeek, startTime, durationMinutes, startDate, coachId, cadence }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(body.error ?? "Could not start recurring sessions.");
      return;
    }
    setPanel(null);
    if (body.warning) setNotice(body.warning);
    router.refresh();
  }

  // ---- Pause ----
  const isPaused = subscriptionStatus === "paused";
  const [pauseStartInput, setPauseStartInput] = useState(pausedStart ?? "");
  const [pauseEndInput, setPauseEndInput] = useState(pausedEnd ?? "");
  const [confirmingUnpause, setConfirmingUnpause] = useState(false);

  async function handlePause() {
    setSaving(true);
    setError(null);
    await fetch("/api/admin/set-pause-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        paused: true,
        pausedStart: pauseStartInput || null,
        pausedEnd: pauseEndInput || null,
      }),
    });
    setSaving(false);
    setPanel(null);
    router.refresh();
  }

  async function handleSaveUnpauseDate() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/set-pause-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        paused: true,
        pausedStart: pausedStart,
        pausedEnd: pauseEndInput || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Could not save that date.");
      return;
    }
    router.refresh();
  }

  async function handleResume() {
    setSaving(true);
    setError(null);
    await fetch("/api/admin/set-pause-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, paused: false }),
    });
    setSaving(false);
    setPanel(null);
    router.refresh();
  }

  // ---- Stop ----
  const [stopReason, setStopReason] = useState("");
  const [lastSessionInput, setLastSessionInput] = useState(
    cancelRequest?.lastSessionOverride ?? computedLastSession ?? "",
  );

  async function handleFlagCancellation() {
    if (!stopReason.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/flag-cancellation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, reason: stopReason.trim() }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not flag this cancellation.");
      return;
    }
    setStopReason("");
    setPanel(null);
    router.refresh();
  }

  async function handleSaveLastSession() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/set-last-session-override", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, lastSessionDate: lastSessionInput || null }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not save that date.");
      return;
    }
    router.refresh();
  }

  async function handleRetain() {
    if (!cancelRequest?.attentionItemId) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/attention-items/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: cancelRequest.attentionItemId,
        status: "resolved",
        note: "Retained — student is staying",
        requestOutcome: "denied",
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not mark this as retained.");
      return;
    }
    setPanel(null);
    router.refresh();
  }

  async function handleConfirmCancelled() {
    if (!cancelRequest?.attentionItemId) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/attention-items/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: cancelRequest.attentionItemId,
        status: "resolved",
        note: "Confirmed cancelled",
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not confirm this cancellation.");
      return;
    }
    setPanel(null);
    router.refresh();
  }

  return (
    <div>
      <div className={styles.lifecycleBar}>
        <button
          onClick={() => toggle("start")}
          disabled={!canStart}
          title={
            !hasCoach
              ? "Assign a coach first"
              : hasRecurringSchedule
                ? "Weekly sessions already started"
                : subscriptionStatus !== "active"
                  ? "Subscription isn't active"
                  : undefined
          }
          className={`${styles.lifecycleBtn} ${panel === "start" ? styles.lifecycleBtnActive : ""}`}
        >
          {hasRecurringSchedule ? "Recurring booked" : "Start"}
        </button>
        <button
          onClick={() => toggle("pause")}
          className={`${styles.lifecycleBtn} ${panel === "pause" || isPaused ? styles.lifecycleBtnActive : ""}`}
        >
          {isPaused ? "Paused" : "Pause"}
        </button>
        <button
          onClick={() => toggle("stop")}
          className={`${styles.lifecycleBtn} ${styles.lifecycleBtnDanger} ${
            panel === "stop" || cancelRequest ? styles.lifecycleBtnActive : ""
          }`}
        >
          {cancelRequest ? "Cancelling" : "Stop"}
        </button>
      </div>

      {error && <p className={styles.errorText} style={{ marginTop: 10 }}>{error}</p>}
      {notice && <p style={{ color: "var(--gold)", fontSize: 13, marginTop: 10 }}>{notice}</p>}

      {panel === "start" && (
        <div className={styles.warnPanel} style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
          <p style={{ marginBottom: 8, fontWeight: 600 }}>Start recurring sessions</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
            <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} className={styles.select}>
              {DAY_NAMES.map((name, i) => (
                <option key={i} value={i}>
                  {name}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={styles.input}
            />
            {coachTimeZone && <span className={styles.mutedText}>({coachTimeZone.replace(/_/g, " ")})</span>}
            <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className={styles.select}>
              <option value="">Select a coach</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className={styles.select}
            >
              <option value={30}>30 min</option>
              <option value={60}>60 min</option>
            </select>
            <select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as "weekly" | "biweekly")}
              className={styles.select}
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
            </select>
            <label className={styles.mutedText} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              Starting
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={styles.inputSmall}
              />
            </label>
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 12 }}>
            <button onClick={handleStart} disabled={saving || !coachId} className={styles.ctaSmall}>
              {saving ? "Starting…" : "Confirm start"}
            </button>
            <button onClick={() => setPanel(null)} disabled={saving} className={styles.linkBtnSmall}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {panel === "pause" && !isPaused && (
        <div className={styles.warnPanel} style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
          <p style={{ marginBottom: 4, fontWeight: 600 }}>Pause weekly sessions</p>
          <p className={styles.mutedText} style={{ marginBottom: 8, fontSize: 12, lineHeight: 1.5 }}>
            Current billing cycle renews {formatPlainDate(billingRenewalDate)}. Billing for the current cycle has
            already run — a pause only stops the <em>next</em> cycle&apos;s charge, it can&apos;t refund one already
            billed.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
            <label className={styles.mutedText} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              From
              <input
                type="date"
                value={pauseStartInput}
                onChange={(e) => setPauseStartInput(e.target.value)}
                className={styles.inputSmall}
              />
            </label>
            <label className={styles.mutedText} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              To (optional)
              <input
                type="date"
                value={pauseEndInput}
                onChange={(e) => setPauseEndInput(e.target.value)}
                className={styles.inputSmall}
              />
            </label>
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 12 }}>
            <button onClick={handlePause} disabled={saving || !pauseStartInput} className={styles.ctaSmall}>
              {saving ? "Pausing…" : "Confirm pause"}
            </button>
            <button onClick={() => setPanel(null)} disabled={saving} className={styles.linkBtnSmall}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {panel === "pause" && isPaused && !confirmingUnpause && (
        <div className={styles.warnPanel} style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
          <p style={{ marginBottom: 8, fontWeight: 600 }}>
            Paused{pausedStart ? ` from ${formatPlainDate(pausedStart)}` : ""}
            {pausedEnd ? ` to ${formatPlainDate(pausedEnd)}` : " — no end date set"}
          </p>
          <label className={styles.mutedText} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Unpause on
            <input
              type="date"
              value={pauseEndInput}
              onChange={(e) => setPauseEndInput(e.target.value)}
              className={styles.inputSmall}
            />
            <button onClick={handleSaveUnpauseDate} disabled={saving} className={styles.linkBtnSmall}>
              {saving ? "Saving…" : "Save"}
            </button>
          </label>
          <p className={styles.mutedText} style={{ marginTop: 4, fontSize: 11 }}>
            Automatically resumes the day after this date — no need to come back and click Unpause.
          </p>
          <div style={{ marginTop: 10, display: "flex", gap: 12 }}>
            <button onClick={() => setConfirmingUnpause(true)} disabled={saving} className={styles.ctaSmall}>
              Unpause now
            </button>
            <button onClick={() => setPanel(null)} disabled={saving} className={styles.linkBtnSmall}>
              Close
            </button>
          </div>
        </div>
      )}

      {panel === "pause" && isPaused && confirmingUnpause && (
        <div className={styles.warnPanel}>
          <p style={{ marginBottom: 4, fontWeight: 600 }}>Unpause this student?</p>
          <p className={styles.mutedText} style={{ marginBottom: 8, fontSize: 13 }}>
            Make sure student is aware of unpause and has paid for the unpause.
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={handleResume} disabled={saving} className={styles.dangerBtn}>
              {saving ? "Unpausing…" : "Yes, unpause"}
            </button>
            <button onClick={() => setConfirmingUnpause(false)} disabled={saving} className={styles.linkBtnSmall}>
              Never mind
            </button>
          </div>
        </div>
      )}

      {panel === "stop" && !cancelRequest && (
        <div className={styles.warnPanel}>
          <p style={{ marginBottom: 4, fontWeight: 600 }}>Flag this student as cancelling</p>
          <p className={styles.mutedText} style={{ marginBottom: 8, fontSize: 12, lineHeight: 1.5 }}>
            This doesn&apos;t cancel anything by itself — Kajabi owns the actual subscription, and this app can&apos;t
            reach it. It lands in Needs Review so it isn&apos;t missed; if it&apos;s still unresolved by the next
            billing cycle, no further sessions will be scheduled for this student.
          </p>
          <textarea
            value={stopReason}
            onChange={(e) => setStopReason(e.target.value)}
            rows={2}
            placeholder="Why is this student cancelling?"
            className={styles.input}
            style={{ display: "block", width: "100%", marginBottom: 8 }}
          />
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={handleFlagCancellation} disabled={saving || !stopReason.trim()} className={styles.dangerBtn}>
              {saving ? "Flagging…" : "Flag cancellation"}
            </button>
            <button onClick={() => setPanel(null)} disabled={saving} className={styles.linkBtnSmall}>
              Never mind
            </button>
          </div>
        </div>
      )}

      {panel === "stop" && cancelRequest && (
        <div className={styles.warnPanel}>
          <p style={{ marginBottom: 4, fontWeight: 600 }}>
            Cancellation {cancelRequest.status === "approved" ? "confirmed" : "pending review"}
          </p>
          {cancelRequest.reason && (
            <p className={styles.mutedText} style={{ marginBottom: 8, fontSize: 12 }}>
              &ldquo;{cancelRequest.reason}&rdquo;
            </p>
          )}
          <p className={styles.mutedText} style={{ marginBottom: 8, fontSize: 13 }}>
            Billing cycle ends {formatPlainDate(cancelRequest.effectiveDate)}.
          </p>
          <label className={styles.mutedText} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            Last session:
            <input
              type="date"
              value={lastSessionInput}
              onChange={(e) => setLastSessionInput(e.target.value)}
              className={styles.inputSmall}
            />
            <button onClick={handleSaveLastSession} disabled={saving} className={styles.linkBtnSmall}>
              Save
            </button>
            {!computedLastSession && !cancelRequest.lastSessionOverride && (
              <span style={{ fontSize: 11 }}>no session found before cycle end — set manually</span>
            )}
          </label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={handleRetain} disabled={saving || !cancelRequest.attentionItemId} className={styles.ctaSmall}>
              Mark retained (student is staying)
            </button>
            <button
              onClick={handleConfirmCancelled}
              disabled={saving || !cancelRequest.attentionItemId}
              className={styles.dangerBtn}
            >
              Mark cancelled (confirmed)
            </button>
            <button onClick={() => setPanel(null)} disabled={saving} className={styles.linkBtnSmall}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

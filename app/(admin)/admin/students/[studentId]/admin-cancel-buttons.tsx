"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormattedDateTime } from "@/components/formatted-time";
import { MONTHLY_CAP, YEARLY_CAP } from "@/lib/booking/cancellation-caps";
import styles from "../../../admin.module.css";

export default function AdminCancelButtons({
  studentId,
  sessionId,
  scheduledAt,
  isMakeup,
  monthlyCreditsUsed,
  yearlyCreditsUsed,
  onSuccess,
}: {
  studentId: string;
  sessionId: string;
  scheduledAt: string;
  isMakeup: boolean;
  monthlyCreditsUsed: number;
  yearlyCreditsUsed: number;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "confirm-regular" | "staff-reason">(null);
  // "Reschedule" reuses the exact same cancel (credit-issuing, same
  // notice rule as a student's own cancellation) — the only difference
  // is where it lands afterward: back on this page vs. straight into
  // the booking calendar to pick the new time in one motion, rather
  // than making admin cancel, then separately hunt for "Book a session".
  const [intent, setIntent] = useState<"cancel" | "reschedule">("cancel");
  const [reason, setReason] = useState("");
  // Defaults to on (the original always-credits behavior). Unchecked for
  // a DNC / non-paying cancellation — the studio's stand-in for
  // automated DNC detection (spec section 11): admin already has to
  // monitor for this, so this is just "staff cancel, but they don't get
  // a credit for a session they didn't pay for."
  const [issueCredit, setIssueCredit] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function doRegularCancel() {
    if (!reason.trim()) return;
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/cancel-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, reason: reason.trim() }),
    });
    const body = await res.json().catch(() => ({}));

    setLoading(false);

    if (!res.ok) {
      setError(body.error ?? "Could not cancel that session.");
      return;
    }

    setMode(null);
    setReason("");

    if (intent === "reschedule") {
      router.push(`/admin/students/${studentId}/book`);
      return;
    }

    setMessage(body.message);
    router.refresh();
    onSuccess?.();
  }

  async function doStaffCancel() {
    if (!reason.trim()) return;
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/staff-cancel-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, reason, issueCredit }),
    });
    const body = await res.json().catch(() => ({}));

    setLoading(false);

    if (!res.ok) {
      setError(body.error ?? "Could not cancel that session.");
      return;
    }

    setMessage(body.message);
    setMode(null);
    setReason("");
    setIssueCredit(true);
    router.refresh();
    onSuccess?.();
  }

  if (message) {
    return <p className={styles.successText} style={{ marginTop: 8 }}>{message}</p>;
  }

  if (mode === "staff-reason") {
    return (
      <div className={styles.warnPanel}>
        <p style={{ marginBottom: 4, fontWeight: 600 }}>
          Staff cancel <FormattedDateTime value={scheduledAt} /> — reason required
        </p>
        <p className={styles.mutedText} style={{ marginBottom: 8 }}>
          {issueCredit
            ? "Issues a session credit (no cap, no expiry) and logs this note for audit — use for studio-side reasons, not the student's own late cancellation."
            : "No credit will be issued — use this for a non-paying (DNC) student, not a studio-side mistake. Still logs the reason for audit."}
        </p>
        <label className={styles.mutedText} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={issueCredit}
            onChange={(e) => setIssueCredit(e.target.checked)}
          />
          Issue a session credit
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Why is the studio cancelling this session?"
          className={styles.input}
          style={{ display: "block", width: "100%", marginBottom: 8 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={doStaffCancel}
            disabled={loading || !reason.trim()}
            className={styles.dangerBtn}
          >
            {loading ? "Cancelling…" : "Confirm staff cancel"}
          </button>
          <button
            onClick={() => {
              setMode(null);
              setReason("");
              setIssueCredit(true);
            }}
            disabled={loading}
            className={styles.linkBtnSmall}
          >
            Never mind
          </button>
        </div>
      </div>
    );
  }

  if (mode === "confirm-regular") {
    const monthlyRemaining = Math.max(0, MONTHLY_CAP - monthlyCreditsUsed);
    const yearlyRemaining = Math.max(0, YEARLY_CAP - yearlyCreditsUsed);

    return (
      <div className={styles.panel} style={{ background: "var(--surface-2)", marginTop: 8, marginBottom: 0, padding: 12 }}>
        <p style={{ marginBottom: 4, fontWeight: 600 }}>
          {intent === "reschedule" ? "Reschedule" : "Cancel"} the <FormattedDateTime value={scheduledAt} /> session?
        </p>
        <p className={styles.panelText} style={{ marginBottom: 8 }}>
          Cancels exactly like the student&apos;s own self-service cancellation — a session
          credit is issued only with 24+ hours notice, and it counts against their
          monthly/yearly cap.
          {intent === "reschedule" && " You'll land on the booking page to pick the new time right after."}
        </p>
        {!isMakeup && (
          <p className={styles.mutedText} style={{ marginBottom: 8, fontWeight: 600 }}>
            Makeup credit cap remaining: {monthlyRemaining}/{MONTHLY_CAP} this month ·{" "}
            {yearlyRemaining}/{YEARLY_CAP} this year
          </p>
        )}
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Reason"
          className={styles.input}
          style={{ display: "block", width: "100%", marginBottom: 8 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={doRegularCancel}
            disabled={loading || !reason.trim()}
            className={styles.dangerBtn}
          >
            {loading ? "Cancelling…" : intent === "reschedule" ? "Confirm & pick new time" : "Confirm cancel"}
          </button>
          <button
            onClick={() => {
              setMode(null);
              setReason("");
            }}
            disabled={loading}
            className={styles.linkBtnSmall}
          >
            Never mind
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && <p className={styles.errorText} style={{ marginBottom: 4 }}>{error}</p>}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button
          onClick={() => {
            setIntent("reschedule");
            setMode("confirm-regular");
          }}
          className={styles.linkBtnSmall}
        >
          Reschedule
        </button>
        <button
          onClick={() => {
            setIntent("cancel");
            setMode("confirm-regular");
          }}
          className={styles.linkBtnSmall}
        >
          Cancel
        </button>
        <button onClick={() => setMode("staff-reason")} className={styles.dangerLink}>
          Staff cancel
        </button>
      </div>
    </div>
  );
}

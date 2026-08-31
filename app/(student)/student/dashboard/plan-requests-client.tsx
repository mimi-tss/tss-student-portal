"use client";

import { useState } from "react";
import { FormattedDate } from "@/components/formatted-time";
import styles from "../../student.module.css";

const EXIT_SURVEY_URL = "https://tally.so/r/5BMe0b";

function ExitSurveyLink() {
  return (
    <p className={styles.panelText} style={{ marginTop: 6 }}>
      <a href={EXIT_SURVEY_URL} target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
        Please complete this quick exit survey
      </a>
    </p>
  );
}

export default function PlanRequestsClient({
  initialPending,
  renewalDate,
}: {
  initialPending: boolean;
  // The student's current billing-cycle end — same date
  // /api/student/requests computes as the request's own effective_date
  // (both derive from currentBillingCycleRange), so this is exactly the
  // date their recurring sessions actually stop getting generated past,
  // not a rough estimate.
  renewalDate: string;
}) {
  const [pending, setPending] = useState(initialPending);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function submitCancel() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/student/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() || undefined }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not submit that request.");
      return;
    }
    setPending(true);
    setSubmitted(true);
    setOpen(false);
  }

  if (submitted) {
    return (
      <div style={{ marginTop: 10 }}>
        <p className={styles.panelText}>
          Cancellation request submitted. Your account will be paused effective <FormattedDate value={renewalDate} />{" "}
          until the studio finalizes your cancellation.
        </p>
        <ExitSurveyLink />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button
        className={styles.linkBtn}
        disabled={pending}
        onClick={() => {
          setOpen((v) => !v);
          setError(null);
        }}
      >
        {pending ? "Cancellation request pending" : "Request to cancel"}
      </button>
      {/* Covers a student who submitted earlier and is revisiting —
          `submitted` above is transient client state that resets on
          reload, but a still-pending request should keep offering the
          survey, not just show it once right after the original submit. */}
      {pending && <ExitSurveyLink />}

      {open && (
        <div className={styles.confirmCard}>
          <p className={styles.confirmTitle}>Request to cancel</p>
          <p className={styles.confirmText}>
            This submits a request to the studio. Your membership stays active until{" "}
            <FormattedDate value={renewalDate} />, when your account will be paused until the studio finalizes your
            cancellation.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Reason (optional)"
            className={styles.textarea}
          />
          {error && <p className={styles.errorText}>{error}</p>}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={submitCancel} disabled={saving} className={styles.btnDanger}>
              {saving ? "Submitting…" : "Submit request"}
            </button>
            <button onClick={() => setOpen(false)} disabled={saving} className={styles.linkBtn}>
              Never mind
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

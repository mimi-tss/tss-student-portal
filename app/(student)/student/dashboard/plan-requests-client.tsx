"use client";

import { useState } from "react";
import styles from "../../student.module.css";

export default function PlanRequestsClient({ initialPending }: { initialPending: boolean }) {
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
      <p className={styles.panelText} style={{ marginTop: 10 }}>
        Cancellation request submitted — the studio will follow up before your next renewal.
      </p>
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

      {open && (
        <div className={styles.confirmCard}>
          <p className={styles.confirmTitle}>Request to cancel</p>
          <p className={styles.confirmText}>
            This submits a request to the studio — your membership stays active until they confirm, effective at
            the end of your current billing cycle.
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

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormattedDateTime } from "@/components/formatted-time";
import { MONTHLY_CAP, YEARLY_CAP } from "@/lib/booking/cancellation-caps";
import styles from "../../student.module.css";

// Mirrors the policy in app/api/booking/cancel/route.ts and migration
// 0012 — this is only used to preview the outcome in the confirm step;
// the API route (and the RLS cap check) is what actually decides.
const NOTICE_HOURS = 24;

function warningFor(
  scheduledAt: string,
  monthlyCreditsUsed: number,
  yearlyCreditsUsed: number,
  isMakeup: boolean,
) {
  const hoursNotice = (new Date(scheduledAt).getTime() - Date.now()) / (60 * 60 * 1000);

  if (hoursNotice < NOTICE_HOURS) {
    return isMakeup
      ? "This is inside the 24-hour notice window, so this cancellation won't give you your session credit back — it'll be forfeited. Do you still want to cancel?"
      : "This is inside the 24-hour notice window, so this cancellation won't earn a session credit — the lesson will be forfeited. Do you still want to cancel?";
  }
  // Rescheduling a makeup session gives back the same credit you already
  // spent on it — not a new student-fault event, so the cap doesn't apply.
  if (isMakeup) {
    return "You're cancelling with more than 24 hours' notice, so the session credit you used to book this will be given back to you.";
  }
  if (monthlyCreditsUsed >= MONTHLY_CAP) {
    return `You're cancelling with plenty of notice, but you've already used your session credit for this month (${monthlyCreditsUsed}/${MONTHLY_CAP}), so this one won't earn an additional credit.`;
  }
  if (yearlyCreditsUsed >= YEARLY_CAP) {
    return `You're cancelling with plenty of notice, but you've already used all of your session credits for this year (${yearlyCreditsUsed}/${YEARLY_CAP}), so this one won't earn an additional credit.`;
  }
  return "You're cancelling with more than 24 hours' notice, so you'll earn a session credit good for 30 days.";
}

export default function CancelButton({
  sessionId,
  scheduledAt,
  isMakeup,
  monthlyCreditsUsed,
  yearlyCreditsUsed,
  onSuccess,
}: {
  sessionId: string;
  scheduledAt: string;
  isMakeup: boolean;
  monthlyCreditsUsed: number;
  yearlyCreditsUsed: number;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Whether this cancellation itself granted or reinstated a credit — a
  // student who cancelled inside the 24-hour window (or already at their
  // cap) has nothing to rebook with, so "Pick a new time now" would just
  // dead-end them on a page that says so.
  const [creditAvailable, setCreditAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    if (!reason.trim()) return;
    setLoading(true);
    setError(null);

    const res = await fetch("/api/booking/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, reason: reason.trim() || undefined }),
    });
    const body = await res.json().catch(() => ({}));

    setLoading(false);

    if (!res.ok) {
      setError(body.error ?? "Could not cancel that session.");
      setConfirming(false);
      return;
    }

    setMessage(body.message);
    setCreditAvailable(!!(body.creditGranted || body.creditReinstated));
    router.refresh();
    onSuccess?.();
  }

  if (message) {
    return (
      <div className={styles.successCard}>
        <p style={{ margin: "0 0 10px" }}>{message}</p>
        {creditAvailable ? (
          <Link href="/student/book" className={styles.linkBtn}>
            Pick a new time now
          </Link>
        ) : (
          <span
            className={styles.linkBtn}
            style={{ opacity: 0.5, cursor: "not-allowed", textDecoration: "underline" }}
            title="No session credit to book with — contact the studio."
          >
            Pick a new time now
          </span>
        )}
      </div>
    );
  }

  if (confirming) {
    const monthlyRemaining = Math.max(0, MONTHLY_CAP - monthlyCreditsUsed);
    const yearlyRemaining = Math.max(0, YEARLY_CAP - yearlyCreditsUsed);

    return (
      <div className={styles.confirmCard}>
        <p className={styles.confirmTitle}>
          Cancel your <FormattedDateTime value={scheduledAt} /> session?
        </p>
        <p className={styles.confirmText}>
          {warningFor(scheduledAt, monthlyCreditsUsed, yearlyCreditsUsed, isMakeup)}
        </p>
        {!isMakeup && (
          <p className={styles.capLine}>
            Makeup credit cap remaining: {monthlyRemaining}/{MONTHLY_CAP} this month ·{" "}
            {yearlyRemaining}/{YEARLY_CAP} this year
          </p>
        )}
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Reason"
          className={styles.textarea}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={handleCancel}
            disabled={loading || !reason.trim()}
            className={styles.btnDanger}
          >
            {loading ? "Cancelling…" : "Yes, cancel"}
          </button>
          <button
            onClick={() => {
              setConfirming(false);
              setReason("");
            }}
            disabled={loading}
            className={styles.linkBtn}
          >
            Never mind
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && <p className={styles.errorText}>{error}</p>}
      <button onClick={() => setConfirming(true)} className={styles.btnGhost}>
        Cancel session
      </button>
    </div>
  );
}

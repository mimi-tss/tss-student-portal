"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormattedDateTime } from "@/components/formatted-time";
import styles from "../../student.module.css";

// Mirrors CancelButton's own 24-hour preview logic (same threshold as
// app/api/student/group-lessons/cancel/route.ts) — this is only for the
// confirm-step warning text; the API route's own check is what actually
// decides. No monthly/yearly cap here at all: a group-lesson credit
// never expires and never counts against the 1:1 makeup cap (a
// completely separate table, group_lesson_credits, not makeup_credits).
const NOTICE_HOURS = 24;

function warningFor(scheduledAt: string, topic: string | null) {
  const hoursNotice = (new Date(scheduledAt).getTime() - Date.now()) / (60 * 60 * 1000);
  if (hoursNotice < NOTICE_HOURS) {
    return "This is inside the 24-hour notice window, so this cancellation won't earn a credit — the class will be forfeited. Do you still want to cancel?";
  }
  return `You're cancelling with more than 24 hours' notice, so you'll earn a credit (no expiration) for a future ${topic || "class with the same topic"}.`;
}

export default function GroupLessonCancelButton({
  registrationId,
  scheduledAt,
  topic,
  onSuccess,
}: {
  registrationId: string;
  scheduledAt: string;
  topic: string | null;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/student/group-lessons/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationId }),
    });
    const body = await res.json().catch(() => ({}));

    setLoading(false);

    if (!res.ok) {
      setError(body.error ?? "Could not cancel that class.");
      setConfirming(false);
      return;
    }

    setMessage(body.message);
    router.refresh();
    onSuccess?.();
  }

  if (message) {
    return <p className={styles.successCard}>{message}</p>;
  }

  if (confirming) {
    return (
      <div className={styles.confirmCard}>
        <p className={styles.confirmTitle}>
          Cancel your <FormattedDateTime value={scheduledAt} /> class?
        </p>
        <p className={styles.confirmText}>{warningFor(scheduledAt, topic)}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={handleCancel} disabled={loading} className={styles.btnDanger}>
            {loading ? "Cancelling…" : "Yes, cancel"}
          </button>
          <button onClick={() => setConfirming(false)} disabled={loading} className={styles.linkBtn}>
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
        Cancel class
      </button>
    </div>
  );
}

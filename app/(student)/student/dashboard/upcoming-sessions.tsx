"use client";

import { useState } from "react";
import { FormattedDateTime } from "@/components/formatted-time";
import CancelButton from "./cancel-button";
import styles from "../../student.module.css";

interface UpcomingSession {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  is_makeup: boolean;
}

// Every session in the current (paid) billing cycle, not just the next
// one — lets a student cancel a lesson further out that they already
// know they'll miss, still under the normal 24h-notice makeup rules.
// Collapsed by default since most students only ever care about the
// next session, which the dashboard already shows above this.
export default function UpcomingSessions({
  monthlyCreditsUsed,
  yearlyCreditsUsed,
}: {
  monthlyCreditsUsed: number;
  yearlyCreditsUsed: number;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<UpcomingSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/sessions/upcoming");
    const body = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(body.error ?? "Could not load your sessions.");
      return;
    }
    setSessions(body.sessions);
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          load();
        }}
        className={styles.linkBtn}
      >
        Show all sessions this billing cycle
      </button>
    );
  }

  return (
    <div className={styles.panel}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>All sessions this billing cycle</h3>
        <button onClick={() => setOpen(false)} className={styles.linkBtn}>
          Hide
        </button>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}
      {loading && <p className={styles.panelText}>Loading…</p>}

      {!loading && sessions && sessions.length === 0 && (
        <p className={styles.panelText}>No other sessions scheduled this cycle.</p>
      )}

      {!loading && sessions && sessions.length > 0 && (
        <ul className={styles.sessionList}>
          {sessions.map((s) => (
            <li key={s.id} className={styles.sessionListItem}>
              <p style={{ margin: 0, fontSize: 14 }}>
                <FormattedDateTime value={s.scheduled_at} />
              </p>
              <CancelButton
                sessionId={s.id}
                scheduledAt={s.scheduled_at}
                isMakeup={s.is_makeup}
                monthlyCreditsUsed={monthlyCreditsUsed}
                yearlyCreditsUsed={yearlyCreditsUsed}
                onSuccess={load}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

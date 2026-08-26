"use client";

import { useState } from "react";
import { FormattedDateTime } from "@/components/formatted-time";
import AdminCancelButtons from "./admin-cancel-buttons";
import ReassignSessionCoach from "./reassign-session-coach";
import styles from "../../../admin.module.css";

interface UpcomingSession {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  is_makeup: boolean;
  actual_coach_id: string;
}

interface Coach {
  id: string;
  name: string;
}

// Admin equivalent of the student's "Show all sessions" list — every
// session in the current (paid) billing cycle, each individually
// cancellable via the same two buttons ("Cancel" / "Staff cancel") used
// for the next session above, and individually reassignable to a
// different coach (a one-off substitute — students/coaches can't do
// this themselves).
export default function AdminUpcomingSessions({
  studentId,
  coaches,
  monthlyCreditsUsed,
  yearlyCreditsUsed,
}: {
  studentId: string;
  coaches: Coach[];
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
    const res = await fetch(`/api/sessions/upcoming?studentId=${studentId}`);
    const body = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(body.error ?? "Could not load sessions.");
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
      <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>All sessions this billing cycle</h2>
        <button onClick={() => setOpen(false)} className={styles.linkBtnSmall}>
          Hide
        </button>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}
      {loading && <p className={styles.mutedText}>Loading…</p>}

      {!loading && sessions && sessions.length === 0 && (
        <p className={styles.emptyState}>No other sessions scheduled this cycle.</p>
      )}

      {!loading && sessions && sessions.length > 0 && (
        <ul className={styles.list}>
          {sessions.map((s) => (
            <li key={s.id} className={styles.listItem}>
              <p>
                <FormattedDateTime value={s.scheduled_at} />
              </p>
              <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 12 }}>
                <AdminCancelButtons
                  sessionId={s.id}
                  scheduledAt={s.scheduled_at}
                  isMakeup={s.is_makeup}
                  monthlyCreditsUsed={monthlyCreditsUsed}
                  yearlyCreditsUsed={yearlyCreditsUsed}
                  onSuccess={load}
                />
                <ReassignSessionCoach
                  sessionId={s.id}
                  currentCoachId={s.actual_coach_id}
                  coaches={coaches}
                  onSuccess={load}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

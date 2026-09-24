"use client";

import { useState } from "react";
import Link from "next/link";
import { FormattedDate, FormattedDateTime } from "@/components/formatted-time";
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

interface UpcomingGroupLesson {
  id: string;
  topic: string | null;
  scheduledAt: string;
  durationMinutes: number;
  coachName: string;
}

interface Coach {
  id: string;
  name: string;
}

// Every future session for this student — not just the paid cycle — so
// admin can check the whole recurring run is scheduled correctly. Paid
// ones (through `paidThrough`: this monthly cycle, or a prepaid
// 6-month/yearly term) get the same Reschedule/Cancel/Staff cancel
// buttons as the next session above; ones past it are marked Unpaid and
// get a single "Cancel unpaid" instead (no credit — nothing was paid).
// Each is individually reassignable to a different coach.
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
  const [groupLessons, setGroupLessons] = useState<UpcomingGroupLesson[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paidThrough, setPaidThrough] = useState<string | null>(null);

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
    setPaidThrough(body.paidThrough ?? null);
    setGroupLessons(body.groupLessons ?? []);
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
        Show all upcoming sessions
      </button>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>All upcoming sessions</h2>
        <button onClick={() => setOpen(false)} className={styles.linkBtnSmall}>
          Hide
        </button>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}
      {loading && <p className={styles.mutedText}>Loading…</p>}

      {!loading && sessions && sessions.length === 0 && groupLessons.length === 0 && (
        <p className={styles.emptyState}>No upcoming sessions scheduled.</p>
      )}

      {!loading && paidThrough && (
        <p className={styles.mutedText} style={{ marginBottom: 8 }}>
          Paid through <FormattedDate value={paidThrough} /> — sessions after that are unpaid.
        </p>
      )}

      {!loading && sessions && (sessions.length > 0 || groupLessons.length > 0) && (
        <ul className={styles.list}>
          {sessions.map((s) => {
            const unpaid = !!paidThrough && new Date(s.scheduled_at).getTime() >= new Date(paidThrough).getTime();
            return (
            <li key={s.id} className={styles.listItem}>
              <p>
                <FormattedDateTime value={s.scheduled_at} /> · {s.duration_minutes} min
                {s.is_makeup ? " · Makeup" : ""}
                {unpaid && <span className={styles.mutedText} style={{ fontWeight: 600 }}> · Unpaid</span>}
              </p>
              <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 12 }}>
                {unpaid ? (
                  <CancelUnpaidButton sessionId={s.id} onSuccess={load} />
                ) : (
                  <AdminCancelButtons
                    studentId={studentId}
                    sessionId={s.id}
                    scheduledAt={s.scheduled_at}
                    isMakeup={s.is_makeup}
                    monthlyCreditsUsed={monthlyCreditsUsed}
                    yearlyCreditsUsed={yearlyCreditsUsed}
                    onSuccess={load}
                  />
                )}
                <ReassignSessionCoach
                  sessionId={s.id}
                  currentCoachId={s.actual_coach_id}
                  coaches={coaches}
                  onSuccess={load}
                />
              </div>
            </li>
            );
          })}
          {groupLessons.map((g) => (
            <li key={g.id} className={styles.listItem}>
              <p>
                {g.topic || "Group Lesson"} — <FormattedDateTime value={g.scheduledAt} />
              </p>
              <p className={styles.mutedText} style={{ marginTop: 4 }}>
                with Coach {g.coachName} · {g.durationMinutes} min · manage via{" "}
                <Link href="/admin/group-lessons" className={styles.linkBtnSmall}>
                  Group Lessons
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// A session past the paid-through date hasn't been paid for, so there's
// nothing to credit back — this is a no-credit staff cancel (same route,
// issueCredit: false, still logged to admin_overrides) with a fixed
// reason, one confirm instead of the reason form.
function CancelUnpaidButton({ sessionId, onSuccess }: { sessionId: string; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    if (!window.confirm("Cancel this unpaid session? No credit is issued.")) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/staff-cancel-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, reason: "Unpaid — cancelled in advance by admin", issueCredit: false }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Could not cancel that session.");
      return;
    }
    onSuccess();
  }

  return (
    <>
      <button onClick={cancel} disabled={loading} className={styles.dangerLink}>
        {loading ? "Cancelling…" : "Cancel unpaid"}
      </button>
      {error && <span className={styles.errorText}>{error}</span>}
    </>
  );
}

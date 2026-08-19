"use client";

import { useState } from "react";
import { FormattedDateTime } from "@/components/formatted-time";
import AdminCancelButtons from "./admin-cancel-buttons";
import ReassignSessionCoach from "./reassign-session-coach";

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
}: {
  studentId: string;
  coaches: Coach[];
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
        className="text-sm text-blue-600 underline"
      >
        Show all sessions this billing cycle
      </button>
    );
  }

  return (
    <div className="rounded border p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500">
          All sessions this billing cycle
        </h2>
        <button onClick={() => setOpen(false)} className="text-xs text-gray-500 underline">
          Hide
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {!loading && sessions && sessions.length === 0 && (
        <p className="text-sm text-gray-500">No other sessions scheduled this cycle.</p>
      )}

      {!loading && sessions && sessions.length > 0 && (
        <ul className="space-y-3">
          {sessions.map((s) => (
            <li key={s.id} className="border-t pt-3 first:border-t-0 first:pt-0">
              <p className="text-sm">
                <FormattedDateTime value={s.scheduled_at} />
              </p>
              <div className="mt-1 flex items-center gap-3">
                <AdminCancelButtons
                  sessionId={s.id}
                  scheduledAt={s.scheduled_at}
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

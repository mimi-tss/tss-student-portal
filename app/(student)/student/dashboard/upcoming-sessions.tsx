"use client";

import { useState } from "react";
import CancelButton from "./cancel-button";

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
              <p className="text-sm">{new Date(s.scheduled_at).toLocaleString()}</p>
              <div className="mt-1">
                <CancelButton
                  sessionId={s.id}
                  scheduledAt={s.scheduled_at}
                  isMakeup={s.is_makeup}
                  monthlyCreditsUsed={monthlyCreditsUsed}
                  yearlyCreditsUsed={yearlyCreditsUsed}
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

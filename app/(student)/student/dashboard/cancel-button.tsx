"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Mirrors the policy in app/api/booking/cancel/route.ts and migration
// 0012 — this is only used to preview the outcome in the confirm step;
// the API route (and the RLS cap check) is what actually decides.
const NOTICE_HOURS = 24;
const MONTHLY_CAP = 1;
const YEARLY_CAP = 6;

function warningFor(
  scheduledAt: string,
  monthlyCreditsUsed: number,
  yearlyCreditsUsed: number,
  isMakeup: boolean,
) {
  const hoursNotice = (new Date(scheduledAt).getTime() - Date.now()) / (60 * 60 * 1000);

  if (hoursNotice < NOTICE_HOURS) {
    return isMakeup
      ? "This is inside the 24-hour notice window, so this cancellation won't give you your session credit back — it'll be forfeited, though you're still welcome to book a new time."
      : "This is inside the 24-hour notice window, so this cancellation won't earn a session credit — the lesson will be forfeited, though you're still welcome to book a new time.";
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
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
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
    router.refresh();
    onSuccess?.();
  }

  if (message) {
    return (
      <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
        <p className="mb-2">{message}</p>
        <Link href="/student/book" className="font-medium text-blue-600 underline">
          Pick a new time now
        </Link>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="max-w-sm rounded border border-gray-200 bg-gray-50 p-3 text-sm">
        <p className="mb-1 font-medium">Are you sure you want to cancel this session?</p>
        <p className="mb-3 text-gray-600">
          {warningFor(scheduledAt, monthlyCreditsUsed, yearlyCreditsUsed, isMakeup)}
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Reason (optional)"
          className="mb-3 w-full rounded border p-2 text-sm"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={handleCancel}
            disabled={loading}
            className="rounded bg-red-600 px-3 py-1 text-white disabled:opacity-50"
          >
            {loading ? "Cancelling…" : "Yes, cancel"}
          </button>
          <button
            onClick={() => {
              setConfirming(false);
              setReason("");
            }}
            disabled={loading}
            className="text-gray-500 underline"
          >
            Never mind
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && <p className="mb-1 text-sm text-red-600">{error}</p>}
      <button
        onClick={() => setConfirming(true)}
        className="rounded border px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
      >
        Cancel session
      </button>
    </div>
  );
}

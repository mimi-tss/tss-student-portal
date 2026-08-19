"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormattedDateTime } from "@/components/formatted-time";
import { MONTHLY_CAP, YEARLY_CAP } from "@/lib/booking/cancellation-caps";

export default function AdminCancelButtons({
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
  const [mode, setMode] = useState<null | "confirm-regular" | "staff-reason">(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function doRegularCancel() {
    if (!reason.trim()) return;
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/cancel-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, reason: reason.trim() }),
    });
    const body = await res.json().catch(() => ({}));

    setLoading(false);

    if (!res.ok) {
      setError(body.error ?? "Could not cancel that session.");
      return;
    }

    setMessage(body.message);
    setMode(null);
    setReason("");
    router.refresh();
    onSuccess?.();
  }

  async function doStaffCancel() {
    if (!reason.trim()) return;
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/staff-cancel-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, reason }),
    });
    const body = await res.json().catch(() => ({}));

    setLoading(false);

    if (!res.ok) {
      setError(body.error ?? "Could not cancel that session.");
      return;
    }

    setMessage(body.message);
    setMode(null);
    setReason("");
    router.refresh();
    onSuccess?.();
  }

  if (message) {
    return <p className="mt-2 text-sm text-green-700">{message}</p>;
  }

  if (mode === "staff-reason") {
    return (
      <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
        <p className="mb-1 font-medium">
          Staff cancel <FormattedDateTime value={scheduledAt} /> — reason required
        </p>
        <p className="mb-2 text-gray-600">
          Always issues a session credit (no cap, no expiry) and logs this note for audit —
          use for studio-side reasons, not the student&apos;s own late cancellation.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Why is the studio cancelling this session?"
          className="mb-2 w-full rounded border p-2 text-sm"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={doStaffCancel}
            disabled={loading || !reason.trim()}
            className="rounded bg-black px-3 py-1 text-xs text-white disabled:opacity-50"
          >
            {loading ? "Cancelling…" : "Confirm staff cancel"}
          </button>
          <button
            onClick={() => {
              setMode(null);
              setReason("");
            }}
            disabled={loading}
            className="text-xs text-gray-600 underline"
          >
            Never mind
          </button>
        </div>
      </div>
    );
  }

  if (mode === "confirm-regular") {
    const monthlyRemaining = Math.max(0, MONTHLY_CAP - monthlyCreditsUsed);
    const yearlyRemaining = Math.max(0, YEARLY_CAP - yearlyCreditsUsed);

    return (
      <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
        <p className="mb-1 font-medium">
          Cancel the <FormattedDateTime value={scheduledAt} /> session?
        </p>
        <p className="mb-2 text-gray-700">
          Cancels exactly like the student&apos;s own self-service cancellation — a session
          credit is issued only with 24+ hours notice, and it counts against their
          monthly/yearly cap.
        </p>
        {!isMakeup && (
          <p className="mb-2 text-xs font-medium text-gray-500">
            Makeup credit cap remaining: {monthlyRemaining}/{MONTHLY_CAP} this month ·{" "}
            {yearlyRemaining}/{YEARLY_CAP} this year
          </p>
        )}
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Reason"
          className="mb-2 w-full rounded border p-2 text-sm"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={doRegularCancel}
            disabled={loading || !reason.trim()}
            className="rounded bg-red-600 px-3 py-1 text-xs text-white disabled:opacity-50"
          >
            {loading ? "Cancelling…" : "Confirm cancel"}
          </button>
          <button
            onClick={() => {
              setMode(null);
              setReason("");
            }}
            disabled={loading}
            className="text-xs text-gray-600 underline"
          >
            Never mind
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && <p className="mb-1 text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-4 text-sm">
        <button onClick={() => setMode("confirm-regular")} className="text-blue-600 underline">
          Cancel
        </button>
        <button onClick={() => setMode("staff-reason")} className="text-amber-700 underline">
          Staff cancel
        </button>
      </div>
    </div>
  );
}

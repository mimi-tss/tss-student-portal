"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CancelButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/booking/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
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
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-600">Cancel this session?</span>
        <button
          onClick={handleCancel}
          disabled={loading}
          className="rounded bg-red-600 px-3 py-1 text-white disabled:opacity-50"
        >
          {loading ? "Cancelling…" : "Yes, cancel"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="text-gray-500 underline"
        >
          Never mind
        </button>
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

"use client";

import { useEffect, useState } from "react";

interface Slot {
  start: string;
  end: string;
}

export default function BookingClient({
  studentId,
  coachId,
}: {
  studentId: string;
  coachId: string | null;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingStart, setBookingStart] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/booking/slots?studentId=${studentId}`)
      .then((res) => res.json())
      .then((data) => setSlots(data.slots ?? []))
      .finally(() => setLoading(false));
  }, [studentId]);

  async function handleBook(slot: Slot) {
    setBookingStart(slot.start);
    setErrorMsg(null);

    const res = await fetch("/api/booking/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, slotStart: slot.start }),
    });

    if (res.ok) {
      setSlots((prev) => prev.filter((s) => s.start !== slot.start));
    } else {
      const body = await res.json().catch(() => ({}));
      setErrorMsg(body.error ?? "Could not book that slot — please try another.");
    }

    setBookingStart(null);
  }

  if (!coachId) {
    return <p className="p-8">No coach assigned yet — contact the studio.</p>;
  }

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="mb-4 text-xl font-semibold">Book a session</h1>

      {loading && <p className="text-gray-500">Loading open slots…</p>}
      {errorMsg && <p className="mb-4 text-sm text-red-600">{errorMsg}</p>}

      <ul className="space-y-2">
        {slots.map((slot) => (
          <li
            key={slot.start}
            className="flex items-center justify-between rounded border p-3"
          >
            <span>{new Date(slot.start).toLocaleString()}</span>
            <button
              onClick={() => handleBook(slot)}
              disabled={bookingStart === slot.start}
              className="rounded bg-black px-3 py-1 text-white disabled:opacity-50"
            >
              {bookingStart === slot.start ? "Booking…" : "Book"}
            </button>
          </li>
        ))}
      </ul>

      {!loading && slots.length === 0 && (
        <p className="text-gray-500">No open slots found in the next two weeks.</p>
      )}
    </main>
  );
}

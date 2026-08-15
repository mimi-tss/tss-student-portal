"use client";

import { useEffect, useState } from "react";

interface Slot {
  start: string;
  end: string;
}

interface Coach {
  id: string;
  name: string;
}

export default function BookingClient({
  studentId,
  mode,
  coachId,
}: {
  studentId: string;
  mode: "full" | "trial";
  coachId: string | null;
}) {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(coachId);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(mode === "full");
  const [bookingStart, setBookingStart] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Trial mode: student picks any coach first (section 5 — no
  // assigned_coach_id needed for the one-time trial lesson).
  useEffect(() => {
    if (mode !== "trial") return;
    fetch("/api/booking/coaches")
      .then((res) => res.json())
      .then((data) => setCoaches(data.coaches ?? []));
  }, [mode]);

  useEffect(() => {
    if (!selectedCoachId) return;
    setLoading(true);
    fetch(`/api/booking/slots?studentId=${studentId}&coachId=${selectedCoachId}`)
      .then((res) => res.json())
      .then((data) => setSlots(data.slots ?? []))
      .finally(() => setLoading(false));
  }, [studentId, selectedCoachId]);

  async function handleBook(slot: Slot) {
    setBookingStart(slot.start);
    setErrorMsg(null);

    const res = await fetch("/api/booking/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        slotStart: slot.start,
        ...(mode === "trial" ? { trial: true, coachId: selectedCoachId } : {}),
      }),
    });

    if (res.ok) {
      setSlots((prev) => prev.filter((s) => s.start !== slot.start));
      if (mode === "trial") setBooked(true);
    } else {
      const body = await res.json().catch(() => ({}));
      setErrorMsg(body.error ?? "Could not book that slot — please try another.");
    }

    setBookingStart(null);
  }

  if (mode === "trial" && booked) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="mb-2 text-xl font-semibold">Trial lesson booked!</h1>
        <p className="text-gray-500">
          We&apos;ll see you then. Check your dashboard for the details.
        </p>
      </main>
    );
  }

  if (mode === "trial" && !selectedCoachId) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="mb-4 text-xl font-semibold">Book your trial lesson</h1>
        <p className="mb-4 text-sm text-gray-500">
          Pick a coach to see their open times.
        </p>
        <ul className="space-y-2">
          {coaches.map((coach) => (
            <li key={coach.id}>
              <button
                onClick={() => setSelectedCoachId(coach.id)}
                className="w-full rounded border p-3 text-left hover:bg-gray-50"
              >
                {coach.name}
              </button>
            </li>
          ))}
        </ul>
        {coaches.length === 0 && (
          <p className="text-gray-500">Loading coaches…</p>
        )}
      </main>
    );
  }

  if (mode === "full" && !coachId) {
    return <p className="p-8">No coach assigned yet — contact the studio.</p>;
  }

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="mb-4 text-xl font-semibold">
        {mode === "trial" ? "Book your trial lesson" : "Book a session"}
      </h1>

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

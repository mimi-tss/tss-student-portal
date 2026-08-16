"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { zonedTimeToUtc } from "@/lib/timezone";
import {
  DEFAULT_TIMEZONE,
  allTimezones,
  detectTimezone,
  timezoneLabel,
} from "@/lib/timezones";

interface Slot {
  start: string;
  end: string;
}

interface Coach {
  id: string;
  name: string;
}

interface Credit {
  id: string;
  expires_at: string | null;
}

function addMonths(year: number, month: number, delta: number) {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function dateKeyInZone(date: Date, timeZone: string) {
  // en-CA gives YYYY-MM-DD directly, matching our grid keys.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

export default function BookingClient({
  studentId,
  mode,
  coachId,
  credits = [],
}: {
  studentId: string;
  mode: "full" | "trial";
  coachId: string | null;
  credits?: Credit[];
}) {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(coachId);

  const now = new Date();
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [timezoneList, setTimezoneList] = useState<string[]>([]);
  const [viewYear, setViewYear] = useState(now.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(now.getUTCMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(mode === "full");
  const [bookingStart, setBookingStart] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [useCredit, setUseCredit] = useState(false);
  const [bookedWithCredit, setBookedWithCredit] = useState(false);
  const [availableCredits, setAvailableCredits] = useState(credits);

  // Auto-detect on mount (client-only — server/first paint use the ET
  // default so there's no SSR/hydration mismatch), then re-center the
  // calendar on "today" in that zone.
  useEffect(() => {
    const detected = detectTimezone();
    setTimezone(detected);
    setTimezoneList(allTimezones());
    const today = new Date();
    const [y, m] = dateKeyInZone(today, detected).split("-").map(Number);
    setViewYear(y);
    setViewMonth(m);
  }, []);

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
    setSelectedDate(null);

    const nextMonth = addMonths(viewYear, viewMonth, 1);
    const start = zonedTimeToUtc(viewYear, viewMonth, 1, 0, 0, timezone);
    const end = new Date(
      zonedTimeToUtc(nextMonth.year, nextMonth.month, 1, 0, 0, timezone).getTime() - 1,
    );

    const params = new URLSearchParams({
      studentId,
      coachId: selectedCoachId,
      start: start.toISOString(),
      end: end.toISOString(),
      ...(mode === "trial" ? { trial: "true" } : {}),
    });

    fetch(`/api/booking/slots?${params}`)
      .then((res) => res.json())
      .then((data) => setSlots(data.slots ?? []))
      .finally(() => setLoading(false));
  }, [studentId, selectedCoachId, mode, viewYear, viewMonth, timezone]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const slot of slots) {
      const key = dateKeyInZone(new Date(slot.start), timezone);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(slot);
    }
    return map;
  }, [slots, timezone]);

  const todayKey = dateKeyInZone(new Date(), timezone);
  const isCurrentMonth = (() => {
    const [ty, tm] = todayKey.split("-").map(Number);
    return ty === viewYear && tm === viewMonth;
  })();

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
        ...(useCredit && availableCredits[0] ? { makeupCreditId: availableCredits[0].id } : {}),
      }),
    });

    if (res.ok) {
      setSlots((prev) => prev.filter((s) => s.start !== slot.start));
      if (mode === "trial") setBooked(true);
      if (mode === "full" && useCredit) {
        setErrorMsg(null);
        setBookedWithCredit(true);
        setUseCredit(false);
        setAvailableCredits((prev) => prev.slice(1));
      }
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
        <p className="mb-4 text-gray-500">
          We&apos;ll see you then. Check your dashboard for the details.
        </p>
        <Link
          href="/student/dashboard"
          className="inline-block rounded bg-black px-4 py-2 text-white"
        >
          Go to dashboard
        </Link>
      </main>
    );
  }

  if (mode === "trial" && !selectedCoachId) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="mb-4 text-xl font-semibold">Book Your FREE First Vocal Coaching Session</h1>
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

  const leadingBlanks = new Date(Date.UTC(viewYear, viewMonth - 1, 1)).getUTCDay();
  const totalDays = daysInMonth(viewYear, viewMonth);
  const dayCells: (number | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  const selectedSlots = selectedDate ? (slotsByDate.get(selectedDate) ?? []) : [];

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-4 text-xl font-semibold">
        {mode === "trial" ? "Book Your FREE First Vocal Coaching Session" : "Book a session"}
      </h1>

      {mode === "full" && (
        <div className="mb-4 rounded border p-3 text-sm">
          {availableCredits.length > 0 ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={useCredit}
                onChange={(e) => setUseCredit(e.target.checked)}
              />
              Use a makeup credit for this booking ({availableCredits.length} available
              {availableCredits[0].expires_at
                ? `, earliest expires ${new Date(availableCredits[0].expires_at).toLocaleDateString()}`
                : ""}
              )
            </label>
          ) : (
            <p className="text-gray-500">No makeup credits available right now.</p>
          )}
        </div>
      )}

      {bookedWithCredit && (
        <p className="mb-4 text-sm text-green-700">Booked using a makeup credit.</p>
      )}

      <div className="mb-4 flex items-center justify-between text-sm">
        <label className="flex items-center gap-2">
          <span className="text-gray-600">Timezone</span>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="rounded border p-1"
          >
            {!timezoneList.includes(timezone) && (
              <option value={timezone}>{timezoneLabel(timezone)}</option>
            )}
            {timezoneList.map((tz) => (
              <option key={tz} value={tz}>
                {timezoneLabel(tz)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {errorMsg && <p className="mb-4 text-sm text-red-600">{errorMsg}</p>}

      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="sm:w-72">
          <div className="mb-2 flex items-center justify-between">
            <button
              onClick={() => {
                const prev = addMonths(viewYear, viewMonth, -1);
                setViewYear(prev.year);
                setViewMonth(prev.month);
              }}
              disabled={isCurrentMonth}
              className="rounded border px-2 py-1 disabled:opacity-30"
            >
              ←
            </button>
            <span className="font-medium">{monthLabel(viewYear, viewMonth)}</span>
            <button
              onClick={() => {
                const next = addMonths(viewYear, viewMonth, 1);
                setViewYear(next.year);
                setViewMonth(next.month);
              }}
              className="rounded border px-2 py-1"
            >
              →
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {dayCells.map((day, i) => {
              if (day === null) return <div key={`b${i}`} />;
              const key = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const hasSlots = (slotsByDate.get(key)?.length ?? 0) > 0;
              const isPastDay = key < todayKey;
              const isSelected = key === selectedDate;

              return (
                <button
                  key={key}
                  disabled={!hasSlots || isPastDay}
                  onClick={() => setSelectedDate(key)}
                  className={`aspect-square rounded text-sm ${
                    isSelected
                      ? "bg-black text-white"
                      : hasSlots
                        ? "bg-blue-50 font-medium text-blue-700 hover:bg-blue-100"
                        : "text-gray-300"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          {loading && <p className="mt-2 text-xs text-gray-500">Loading availability…</p>}
        </div>

        <div className="flex-1">
          {!selectedDate && (
            <p className="text-sm text-gray-500">Pick a highlighted date to see open times.</p>
          )}
          {selectedDate && selectedSlots.length === 0 && (
            <p className="text-sm text-gray-500">No open times that day.</p>
          )}
          {selectedDate && selectedSlots.length > 0 && (
            <>
              <p className="mb-2 text-sm font-medium">
                {new Date(selectedSlots[0].start).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  timeZone: timezone,
                })}
              </p>
              <ul className="space-y-2">
                {selectedSlots.map((slot) => (
                  <li key={slot.start} className="flex items-center justify-between rounded border p-2">
                    <span>
                      {new Date(slot.start).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: timezone,
                      })}
                    </span>
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
            </>
          )}
        </div>
      </div>
    </main>
  );
}

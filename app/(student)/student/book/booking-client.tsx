"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { zonedTimeToUtc, formatDateInZone, formatTimeInZone, timezoneAbbreviation } from "@/lib/timezone";
import { useTimeZone } from "@/components/timezone-context";
import TimeZoneSelect from "@/components/timezone-select";

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
  duration_minutes: number | null;
}

function addMonths(year: number, month: number, delta: number) {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// `year`/`month` are plain calendar-grid coordinates, not a real instant
// — formatting them via Date+Intl+timeZone (the previous implementation,
// hardcoded to "UTC") risks the opposite bug it looks like it's avoiding:
// midnight UTC on the 1st reformatted into a zone behind UTC rolls back
// to the last day of the *previous* month, naming the wrong month
// entirely. A plain lookup has no zone to get wrong.
function monthLabel(year: number, month: number) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
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
  canBookWithoutCredit = true,
}: {
  studentId: string;
  mode: "full" | "trial";
  coachId: string | null;
  credits?: Credit[];
  // False for a non-Pro/Elite student who's only here because of a
  // purchased-addon credit (section 5) — they have no other entitlement
  // to book with, so offering "book without credit" would just 403.
  canBookWithoutCredit?: boolean;
}) {
  const router = useRouter();
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(coachId);

  const now = new Date();
  // Shared with every other page (dashboard, header selector) instead of
  // a page-local choice — defaults to Eastern on first paint (no SSR/
  // hydration mismatch), then the student layout's TimeZoneProvider
  // swaps to the viewer's detected zone right after mount unless they've
  // already picked an explicit override, same as everywhere else.
  const { timeZone: timezone, setTimeZone: setTimezone } = useTimeZone();
  const [viewYear, setViewYear] = useState(now.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(now.getUTCMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(mode === "full");
  const [bookingStart, setBookingStart] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [bookedWithCredit, setBookedWithCredit] = useState(false);
  const [availableCredits, setAvailableCredits] = useState(credits);
  const [expiryWarningSlot, setExpiryWarningSlot] = useState<Slot | null>(null);

  // Re-sync from the server whenever the credit list actually changes
  // identity. Without this, navigating away and back re-mounts this
  // component against Next's cached (stale) server payload, resurrecting
  // a credit that was already spent — the UI would offer it again and
  // only the API would catch it, at which point the student has already
  // picked a slot. Keyed on ids so a parent re-render alone doesn't churn.
  const creditsKey = credits.map((c) => c.id).join(",");
  useEffect(() => {
    setAvailableCredits(credits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creditsKey]);

  // Re-center the calendar on "today" in the viewing zone. Keeps doing
  // this as `timezone` settles from its ET default to a stored
  // preference or auto-detected zone (context resolves that a beat
  // after this component's own mount, in the same commit) — but stops
  // the moment the student manually pages the calendar, so a later zone
  // change doesn't yank them back to today's month.
  const hasNavigatedRef = useRef(false);
  useEffect(() => {
    if (hasNavigatedRef.current) return;
    const [y, m] = dateKeyInZone(new Date(), timezone).split("-").map(Number);
    setViewYear(y);
    setViewMonth(m);
  }, [timezone]);

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
      // Slot length follows the available credit's own duration (e.g. a
      // purchased 60-min add-on) rather than the student's default plan —
      // a credit is always applied automatically when one exists.
      ...(availableCredits[0] ? { creditId: availableCredits[0].id } : {}),
    });

    fetch(`/api/booking/slots?${params}`)
      .then((res) => res.json())
      .then((data) => setSlots(data.slots ?? []))
      .finally(() => setLoading(false));
  }, [studentId, selectedCoachId, mode, viewYear, viewMonth, timezone, availableCredits]);

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

  async function proceedBooking(slot: Slot, applyCredit: boolean) {
    setBookingStart(slot.start);
    setErrorMsg(null);
    setExpiryWarningSlot(null);

    const res = await fetch("/api/booking/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        slotStart: slot.start,
        ...(mode === "trial" ? { trial: true, coachId: selectedCoachId } : {}),
        ...(applyCredit && availableCredits[0] ? { makeupCreditId: availableCredits[0].id } : {}),
      }),
    });

    if (res.ok) {
      setSlots((prev) => prev.filter((s) => s.start !== slot.start));
      if (mode === "trial") setBooked(true);
      if (mode === "full" && applyCredit) {
        setErrorMsg(null);
        setBookedWithCredit(true);
        setAvailableCredits((prev) => prev.slice(1));
      }
      // Invalidate the router cache so the credit balance (and the
      // dashboard's copy of it) reflects what was just spent, rather
      // than a cached payload from before this booking.
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setErrorMsg(body.error ?? "Could not book that slot — please try another.");
    }

    setBookingStart(null);
  }

  // Warn before even trying, rather than letting the server 409 it —
  // the credit's expiry (not just "not expired right now", see the
  // booking API) means a date past that point simply can't use it. A
  // credit is always applied automatically when one is available.
  function handleBook(slot: Slot) {
    const credit = availableCredits[0];
    if (credit?.expires_at && new Date(slot.start) > new Date(credit.expires_at)) {
      setExpiryWarningSlot(slot);
      return;
    }
    proceedBooking(slot, !!credit);
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

  // A student with no credits who also can't book without one has nothing
  // bookable here — say so up front rather than letting them pick a slot
  // and hit a 403 on the Book button.
  const blockedNoCredits =
    mode === "full" && availableCredits.length === 0 && !canBookWithoutCredit;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-4 text-xl font-semibold">
        {mode === "trial" ? "Book Your FREE First Vocal Coaching Session" : "Book a session"}
      </h1>

      {mode === "full" && availableCredits.length > 0 && (
        <div className="mb-4 rounded border p-3 text-sm text-gray-700">
          This booking will use a {availableCredits[0].duration_minutes ?? 30}-min session credit
          ({availableCredits.length} available
          {availableCredits[0].expires_at
            ? `, earliest expires ${formatDateInZone(availableCredits[0].expires_at, timezone)}`
            : ""}
          )
        </div>
      )}

      {blockedNoCredits && (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium">No session credits available</p>
          <p className="mt-1 text-gray-700">
            Your regular weekly lessons are already scheduled for you — contact the studio to
            change that time. To book an extra lesson, contact the studio to purchase one.
          </p>
        </div>
      )}

      {mode === "full" && availableCredits.length === 0 && canBookWithoutCredit && (
        <div className="mb-4 rounded border p-3 text-sm text-gray-500">
          No session credits available — booking here will create a plain session (admin override).
        </div>
      )}

      {bookedWithCredit && (
        <p className="mb-4 text-sm text-green-700">Booked using a session credit.</p>
      )}

      <div className="mb-4 flex items-center justify-between text-sm">
        <label className="flex items-center gap-2">
          <span className="text-gray-600">Timezone ({timezoneAbbreviation(timezone)})</span>
          <TimeZoneSelect value={timezone} onChange={setTimezone} />
        </label>
      </div>

      {errorMsg && <p className="mb-4 text-sm text-red-600">{errorMsg}</p>}

      {expiryWarningSlot && (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="mb-1 font-medium">This time is past your session credit&apos;s expiry</p>
          <p className="mb-3 text-gray-700">
            Your session credit expires{" "}
            {availableCredits[0]?.expires_at
              ? formatDateInZone(availableCredits[0].expires_at, timezone)
              : ""}
            , before {formatDateInZone(expiryWarningSlot.start, timezone)}.{" "}
            {canBookWithoutCredit
              ? "It won't be applied to this booking."
              : "This student's plan doesn't include booking without a credit, so please pick an earlier date instead."}
          </p>
          <div className="flex items-center gap-3">
            {canBookWithoutCredit && (
              <button
                onClick={() => proceedBooking(expiryWarningSlot, false)}
                className="rounded bg-black px-3 py-1 text-xs text-white"
              >
                Book without credit
              </button>
            )}
            <button
              onClick={() => setExpiryWarningSlot(null)}
              className="text-xs text-gray-600 underline"
            >
              Choose a different date
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="sm:w-72">
          <div className="mb-2 flex items-center justify-between">
            <button
              onClick={() => {
                hasNavigatedRef.current = true;
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
                hasNavigatedRef.current = true;
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
                })}{" "}
                <span className="font-normal text-gray-500">
                  ({timezoneAbbreviation(timezone)})
                </span>
              </p>
              <ul className="space-y-2">
                {selectedSlots.map((slot) => (
                  <li key={slot.start} className="flex items-center justify-between rounded border p-2">
                    <span>{formatTimeInZone(slot.start, timezone)}</span>
                    <button
                      onClick={() => handleBook(slot)}
                      disabled={bookingStart === slot.start || blockedNoCredits}
                      title={
                        blockedNoCredits
                          ? "You need a session credit to book — contact the studio."
                          : undefined
                      }
                      className="rounded bg-black px-3 py-1 text-white disabled:cursor-not-allowed disabled:opacity-40"
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

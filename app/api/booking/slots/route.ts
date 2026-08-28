import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { zonedTimeToUtc, zonedYearMonthDay } from "@/lib/timezone";
import { getHeldRecurringSlots } from "@/lib/scheduling/recurring";
import { resolveWorkingHoursForDate } from "@/lib/scheduling/working-hours";
import { getHolidayDateKeys } from "@/lib/scheduling/holidays";

// Computes open slots for the student's own assigned coach:
// coach working_hours minus coach_blocks minus existing sessions.
// See TSS_App_Spec_1.md section 5 ("Coach availability").
//
// Coaches are spread across multiple timezones (confirmed, not assumed),
// so "09:00"-"17:00" is only meaningful against that specific coach's
// own timezone column — walking calendar days and converting each
// window's start/end via zonedTimeToUtc, not naive server-local
// setHours(), which silently used whatever timezone the server process
// happens to run in (previously a real, if minor, bug).
//
// Slot *length* depends on the student's session_duration_minutes (the
// 60-min add-on, section 2) by default — trial lessons are always a
// fixed 30 regardless, since the add-on is Pro/Elite-only and mutually
// exclusive with the Suite-tier trial. If a specific creditId is passed
// (the student has "use a credit" checked), that credit's own duration
// overrides the student's ambient setting, since a purchased 60-min
// add-on should show 60-min slots even for a 30-min-plan student. Start
// times still walk in 30-min increments either way, so a 60-min student
// sees overlapping options (e.g. 2:00 and 2:30) until they book one,
// same as any variable-length booking system.
//
// Range is caller-supplied (start/end, absolute instants) rather than a
// fixed lookahead — the booking UI is a month calendar, so it asks for
// whatever month is currently in view, computed in the *student's*
// chosen display timezone. Defaults to a 14-day window if omitted, for
// any other caller.

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DEFAULT_LOOKAHEAD_DAYS = 14;
const MAX_RANGE_DAYS = 62;
const WALK_MINUTES = 30;

type WorkingHours = Record<string, [string, string][]>;

export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get("studentId");
  const requestedCoachId = req.nextUrl.searchParams.get("coachId");
  const isTrial = req.nextUrl.searchParams.get("trial") === "true";
  const creditId = req.nextUrl.searchParams.get("creditId");
  const startParam = req.nextUrl.searchParams.get("start");
  const endParam = req.nextUrl.searchParams.get("end");
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const now = new Date();
  const rangeStart = startParam ? new Date(startParam) : now;
  const rangeEnd = endParam
    ? new Date(endParam)
    : new Date(now.getTime() + DEFAULT_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime()) || rangeEnd < rangeStart) {
    return NextResponse.json({ error: "invalid start/end" }, { status: 400 });
  }
  if (rangeEnd.getTime() - rangeStart.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "range too large" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("assigned_coach_id, session_duration_minutes")
    .eq("id", studentId)
    .single();

  // An explicit coachId (trial-lesson coach picker, section 5) overrides
  // assigned_coach_id — a fresh Suite student may not have one yet.
  const coachId = requestedCoachId ?? student?.assigned_coach_id ?? null;

  let slotMinutes = isTrial ? 30 : (student?.session_duration_minutes ?? 30);
  if (!isTrial && creditId) {
    const { data: credit } = await supabase
      .from("makeup_credits")
      .select("duration_minutes")
      .eq("id", creditId)
      .maybeSingle();
    if (credit?.duration_minutes) slotMinutes = credit.duration_minutes;
  }

  if (!coachId) {
    return NextResponse.json({ slots: [] });
  }

  const { data: coach } = await supabase
    .from("coaches")
    .select("working_hours, pending_working_hours, pending_effective_date, timezone")
    .eq("id", coachId)
    .single();

  const timeZone = coach?.timezone ?? "America/New_York";

  const [{ data: blocks }, { data: existingSessions }, heldSlots] = await Promise.all([
    supabase
      .from("coach_blocks")
      .select("start_at, end_at")
      .eq("coach_id", coachId)
      .lte("start_at", rangeEnd.toISOString())
      .gte("end_at", rangeStart.toISOString()),
    // Only a with-notice cancellation actually frees the slot back up —
    // a no-notice (late) cancellation stays blocked, since it's too
    // last-minute to realistically re-fill (spec's no-refund framing:
    // the coach is still paid for it either way).
    supabase
      .from("sessions")
      .select("scheduled_at, duration_minutes")
      .eq("actual_coach_id", coachId)
      .gte("scheduled_at", rangeStart.toISOString())
      .lte("scheduled_at", rangeEnd.toISOString())
      .not("status", "eq", "cancelled-with-notice"),
    // A paused student's slot stays reserved (spec section 3) — no
    // session row exists for it during the pause, so it needs its own
    // fetch to stay blocked from other students booking into it.
    getHeldRecurringSlots(supabase, coachId, rangeStart, rangeEnd),
  ]);

  const busyRanges = [
    ...(blocks ?? []).map((b) => [new Date(b.start_at), new Date(b.end_at)] as const),
    ...heldSlots.map((h) => {
      const start = new Date(h.scheduledAt);
      const end = new Date(start.getTime() + h.durationMinutes * 60 * 1000);
      return [start, end] as const;
    }),
    ...(existingSessions ?? []).map((s) => {
      const start = new Date(s.scheduled_at);
      const end = new Date(start.getTime() + s.duration_minutes * 60 * 1000);
      return [start, end] as const;
    }),
  ];

  const slots: Slot[] = [];
  const effectiveStart = rangeStart > now ? rangeStart : now;
  const holidayDates = await getHolidayDateKeys(supabase);

  // Walk pure calendar days (Date.UTC on Y/M/D numbers) from rangeStart's
  // date through rangeEnd's date, both read in the *coach's* timezone
  // (working_hours are defined against that zone) — DST-safe, since
  // we're manipulating calendar dates, not instants, until the very end
  // when zonedTimeToUtc converts each window's wall-clock time.
  const [startYear, startMonth, startDay] = zonedYearMonthDay(rangeStart, timeZone);
  const [endYear, endMonth, endDay] = zonedYearMonthDay(rangeEnd, timeZone);

  let cursorDate = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const lastDate = new Date(Date.UTC(endYear, endMonth - 1, endDay));

  while (cursorDate.getTime() <= lastDate.getTime()) {
    const year = cursorDate.getUTCFullYear();
    const month = cursorDate.getUTCMonth() + 1;
    const day = cursorDate.getUTCDate();
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    // The studio is closed studio-wide on a holiday date — no slots at
    // all that day, for any coach, regardless of their own working hours.
    if (holidayDates.has(dateKey)) {
      cursorDate = new Date(cursorDate.getTime() + 24 * 60 * 60 * 1000);
      continue;
    }

    const dayWorkingHours = resolveWorkingHoursForDate(
      {
        workingHours: (coach?.working_hours ?? {}) as WorkingHours,
        pendingWorkingHours: coach?.pending_working_hours as WorkingHours | null,
        pendingEffectiveDate: coach?.pending_effective_date ?? null,
      },
      dateKey,
    );
    const windows = dayWorkingHours[DAY_KEYS[cursorDate.getUTCDay()]] ?? [];

    for (const [winStart, winEnd] of windows) {
      const [startH, startM] = winStart.split(":").map(Number);
      const [endH, endM] = winEnd.split(":").map(Number);

      let cursor = zonedTimeToUtc(year, month, day, startH, startM, timeZone);
      const windowEnd = zonedTimeToUtc(year, month, day, endH, endM, timeZone);

      while (cursor.getTime() + slotMinutes * 60 * 1000 <= windowEnd.getTime()) {
        const slotEnd = new Date(cursor.getTime() + slotMinutes * 60 * 1000);
        const inRange = cursor >= effectiveStart && cursor <= rangeEnd;
        const overlapsBusy = busyRanges.some(
          ([bStart, bEnd]) => cursor < bEnd && slotEnd > bStart,
        );

        if (inRange && !overlapsBusy) {
          slots.push({ start: cursor.toISOString(), end: slotEnd.toISOString() });
        }

        cursor = new Date(cursor.getTime() + WALK_MINUTES * 60 * 1000);
      }
    }

    cursorDate = new Date(cursorDate.getTime() + 24 * 60 * 60 * 1000);
  }

  return NextResponse.json({ slots });
}

interface Slot {
  start: string;
  end: string;
}

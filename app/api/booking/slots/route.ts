import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { zonedTimeToUtc, zonedYearMonthDay } from "@/lib/timezone";

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
// 60-min add-on, section 2) — trial lessons are always a fixed 30
// regardless, since the add-on is Pro/Elite-only and mutually exclusive
// with the Suite-tier trial. Start times still walk in 30-min
// increments either way, so a 60-min student sees overlapping options
// (e.g. 2:00 and 2:30) until they book one, same as any variable-length
// booking system.

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const LOOKAHEAD_DAYS = 14;
const WALK_MINUTES = 30;

type WorkingHours = Record<string, [string, string][]>;

export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get("studentId");
  const requestedCoachId = req.nextUrl.searchParams.get("coachId");
  const isTrial = req.nextUrl.searchParams.get("trial") === "true";
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
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
  const slotMinutes = isTrial ? 30 : (student?.session_duration_minutes ?? 30);

  if (!coachId) {
    return NextResponse.json({ slots: [] });
  }

  const { data: coach } = await supabase
    .from("coaches")
    .select("working_hours, timezone")
    .eq("id", coachId)
    .single();

  const workingHours = (coach?.working_hours ?? {}) as WorkingHours;
  const timeZone = coach?.timezone ?? "America/New_York";

  const now = new Date();
  const horizon = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  const [{ data: blocks }, { data: existingSessions }] = await Promise.all([
    supabase
      .from("coach_blocks")
      .select("start_at, end_at")
      .eq("coach_id", coachId)
      .lte("start_at", horizon.toISOString())
      .gte("end_at", now.toISOString()),
    supabase
      .from("sessions")
      .select("scheduled_at, duration_minutes")
      .eq("actual_coach_id", coachId)
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", horizon.toISOString())
      .not("status", "in", "(cancelled-with-notice,cancelled-no-notice)"),
  ]);

  const busyRanges = [
    ...(blocks ?? []).map((b) => [new Date(b.start_at), new Date(b.end_at)] as const),
    ...(existingSessions ?? []).map((s) => {
      const start = new Date(s.scheduled_at);
      const end = new Date(start.getTime() + s.duration_minutes * 60 * 1000);
      return [start, end] as const;
    }),
  ];

  const slots: Slot[] = [];

  // Anchor on "today" in the coach's own timezone, then walk forward in
  // pure calendar days (Date.UTC on Y/M/D numbers) — DST-safe, since
  // we're manipulating calendar dates, not instants, until the very end
  // when zonedTimeToUtc converts each window's wall-clock time.
  const [nowYear, nowMonth, nowDay] = zonedYearMonthDay(now, timeZone);

  for (let d = 0; d < LOOKAHEAD_DAYS; d++) {
    const dateOnly = new Date(Date.UTC(nowYear, nowMonth - 1, nowDay + d));
    const year = dateOnly.getUTCFullYear();
    const month = dateOnly.getUTCMonth() + 1;
    const day = dateOnly.getUTCDate();
    const windows = workingHours[DAY_KEYS[dateOnly.getUTCDay()]] ?? [];

    for (const [winStart, winEnd] of windows) {
      const [startH, startM] = winStart.split(":").map(Number);
      const [endH, endM] = winEnd.split(":").map(Number);

      let cursor = zonedTimeToUtc(year, month, day, startH, startM, timeZone);
      const windowEnd = zonedTimeToUtc(year, month, day, endH, endM, timeZone);

      while (cursor.getTime() + slotMinutes * 60 * 1000 <= windowEnd.getTime()) {
        const slotEnd = new Date(cursor.getTime() + slotMinutes * 60 * 1000);
        const isPast = cursor < now;
        const overlapsBusy = busyRanges.some(
          ([bStart, bEnd]) => cursor < bEnd && slotEnd > bStart,
        );

        if (!isPast && !overlapsBusy) {
          slots.push({ start: cursor.toISOString(), end: slotEnd.toISOString() });
        }

        cursor = new Date(cursor.getTime() + WALK_MINUTES * 60 * 1000);
      }
    }
  }

  return NextResponse.json({ slots });
}

interface Slot {
  start: string;
  end: string;
}

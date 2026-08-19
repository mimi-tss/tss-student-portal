import { zonedTimeToUtc, zonedYearMonthDay } from "@/lib/timezone";

// How far ahead recurring occurrences are materialized. Topped up daily
// by /api/cron/materialize-recurring, so the calendar always has roughly
// this much runway rather than running dry.
export const WEEKS_AHEAD = 8;

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

type WorkingHours = Record<string, [string, string][]>;

export function formatSlotLabel(dayOfWeek: number, startTime: string) {
  const [h, m] = startTime.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${DAY_NAMES[dayOfWeek]}s at ${displayHour}:${String(m).padStart(2, "0")} ${period}`;
}

// A recurring slot must sit inside the coach's working hours, otherwise
// the generated sessions would be invisible on the coach calendar — that
// grid only renders cells that fall within working hours, so an
// out-of-hours session would silently vanish from the one view the coach
// actually uses. Rejecting up front beats generating ghost sessions.
export function slotFitsWorkingHours(
  workingHours: WorkingHours,
  dayOfWeek: number,
  startTime: string,
  durationMinutes: number,
): boolean {
  const windows = workingHours?.[DAY_KEYS[dayOfWeek]] ?? [];
  const [sh, sm] = startTime.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = startMin + durationMinutes;

  return windows.some(([winStart, winEnd]) => {
    const [wsh, wsm] = winStart.split(":").map(Number);
    const [weh, wem] = winEnd.split(":").map(Number);
    return startMin >= wsh * 60 + wsm && endMin <= weh * 60 + wem;
  });
}

// Every future occurrence of the slot within the horizon, as real UTC
// instants. Walks calendar dates in the coach's zone and converts each
// one individually so a DST shift moves the UTC instant but keeps the
// wall-clock lesson time put.
export function occurrencesFor(
  dayOfWeek: number,
  startTime: string,
  timeZone: string,
  from: Date,
  weeksAhead = WEEKS_AHEAD,
): Date[] {
  const [hh, mm] = startTime.split(":").map(Number);
  const [y, m, d] = zonedYearMonthDay(from, timeZone);
  const out: Date[] = [];

  for (let i = 0; i < weeksAhead * 7; i++) {
    const dateOnly = new Date(Date.UTC(y, m - 1, d + i));
    if (dateOnly.getUTCDay() !== dayOfWeek) continue;

    const instant = zonedTimeToUtc(
      dateOnly.getUTCFullYear(),
      dateOnly.getUTCMonth() + 1,
      dateOnly.getUTCDate(),
      hh,
      mm,
      timeZone,
    );
    if (instant > from) out.push(instant);
  }

  return out;
}

interface MaterializeResult {
  created: number;
  skipped: number;
}

// Creates any missing future occurrences for active schedules. Idempotent:
// an occurrence is skipped if the student already has ANY session at that
// exact instant — which deliberately includes cancelled ones, so a lesson
// the student cancelled doesn't silently reappear on the next top-up run.
export async function materializeRecurringSessions(
  // Accepts either the RLS-scoped server client or the service-role admin
  // client (the cron path), so both share one implementation.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: { studentId?: string; scheduleId?: string } = {},
): Promise<MaterializeResult> {
  let query = supabase
    .from("recurring_schedules")
    .select("id, student_id, coach_id, day_of_week, start_time, duration_minutes")
    .eq("active", true);

  if (opts.studentId) query = query.eq("student_id", opts.studentId);
  if (opts.scheduleId) query = query.eq("id", opts.scheduleId);

  const { data: schedules } = await query;
  const now = new Date();
  let created = 0;
  let skipped = 0;

  for (const schedule of schedules ?? []) {
    const { data: coach } = await supabase
      .from("coaches")
      .select("timezone")
      .eq("id", schedule.coach_id)
      .single();

    const timeZone = coach?.timezone ?? "America/New_York";
    const instants = occurrencesFor(
      schedule.day_of_week,
      schedule.start_time,
      timeZone,
      now,
    );

    if (instants.length === 0) continue;

    const horizonEnd = instants[instants.length - 1];

    // Any existing session for this student in the window, whatever its
    // status — a cancelled occurrence still counts as "handled".
    const { data: existing } = await supabase
      .from("sessions")
      .select("scheduled_at")
      .eq("student_id", schedule.student_id)
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", horizonEnd.toISOString());

    const taken = new Set(
      (existing ?? []).map((s: { scheduled_at: string }) =>
        new Date(s.scheduled_at).getTime(),
      ),
    );

    // The coach could also be busy with another student at that instant
    // (e.g. a makeup booked into this slot before the schedule existed).
    const { data: coachBusy } = await supabase
      .from("sessions")
      .select("scheduled_at")
      .eq("actual_coach_id", schedule.coach_id)
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", horizonEnd.toISOString())
      .not("status", "in", "(cancelled-with-notice,cancelled-no-notice)");

    const coachTaken = new Set(
      (coachBusy ?? []).map((s: { scheduled_at: string }) =>
        new Date(s.scheduled_at).getTime(),
      ),
    );

    const rows = [];
    for (const instant of instants) {
      if (taken.has(instant.getTime()) || coachTaken.has(instant.getTime())) {
        skipped++;
        continue;
      }
      rows.push({
        student_id: schedule.student_id,
        actual_coach_id: schedule.coach_id,
        scheduled_at: instant.toISOString(),
        duration_minutes: schedule.duration_minutes,
        status: "scheduled",
        recurring_schedule_id: schedule.id,
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("sessions").insert(rows);
      if (!error) created += rows.length;
    }
  }

  return { created, skipped };
}

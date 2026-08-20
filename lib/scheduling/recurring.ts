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

// `start_time` is wall-clock in the COACH's own zone, not necessarily
// the zone it's being displayed in (an admin viewing in Eastern for a
// Pacific coach, or a student viewing in their own local zone) — so
// showing it as a bare string would silently show the wrong time to
// anyone not in the coach's zone. This picks the nearest real instant
// (today or later) that actually falls on `dayOfWeek` at `startTime` in
// `coachTimeZone`, so callers can reformat it into any viewer's zone via
// formatTimeInZone/formatDateTimeInZone (lib/timezone.ts) and get both
// the correct clock time AND, in the rare case the zone gap crosses
// midnight, the correct day. Purely a display helper — not used for
// generating real occurrences (see occurrencesFor for that).
export function nextWeeklySlotInstant(
  dayOfWeek: number,
  startTime: string,
  coachTimeZone: string,
  from: Date = new Date(),
): Date {
  const [hh, mm] = startTime.split(":").map(Number);
  const [y, m, d] = zonedYearMonthDay(from, coachTimeZone);

  for (let i = 0; i < 7; i++) {
    const dateOnly = new Date(Date.UTC(y, m - 1, d + i));
    if (dateOnly.getUTCDay() !== dayOfWeek) continue;
    return zonedTimeToUtc(
      dateOnly.getUTCFullYear(),
      dateOnly.getUTCMonth() + 1,
      dateOnly.getUTCDate(),
      hh,
      mm,
      coachTimeZone,
    );
  }

  // Unreachable — every 7-day window contains each weekday exactly once.
  return from;
}

// Pro/Elite entitlement is 4 weekly sessions per billing cycle (spec
// section 4), not per calendar month — cycles are anchored to each
// student's own billing_anniversary_date, not a shared 1st-of-month.
// A weekly cadence doesn't divide evenly into a ~30-31 day cycle, so
// some cycles naturally contain a 5th weekly occurrence; that leftover
// occurrence simply isn't scheduled ("week off"), not billed or booked.
export const CYCLE_SESSION_CAP = 4;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// The cycle-start calendar date that (year, month, day) falls into,
// anchored on the same day-of-month every month — clamped for short
// months, e.g. an anchor of the 31st becomes the 30th in a 30-day month
// or the 28th/29th in February, matching how a real monthly billing
// anniversary behaves.
function cycleStartForDate(
  year: number,
  month: number,
  day: number,
  anchorDay: number,
): [number, number, number] {
  const effectiveThisMonth = Math.min(anchorDay, daysInMonth(year, month));
  if (day >= effectiveThisMonth) {
    return [year, month, effectiveThisMonth];
  }
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const effectivePrevMonth = Math.min(anchorDay, daysInMonth(prevYear, prevMonth));
  return [prevYear, prevMonth, effectivePrevMonth];
}

// 1-indexed position of `instant` among same-weekday occurrences within
// its billing cycle — e.g. the 1st, 2nd, 3rd, 4th, or (skipped) 5th
// Wednesday since the cycle started. Cycle-date arithmetic is done in
// the coach's own zone, the same frame occurrences are already
// generated in.
function cycleOccurrenceNumber(instant: Date, anchorDay: number, timeZone: string): number {
  const [y, m, d] = zonedYearMonthDay(instant, timeZone);
  const [cy, cm, cd] = cycleStartForDate(y, m, d, anchorDay);
  const cycleStart = Date.UTC(cy, cm - 1, cd);
  const dateOnly = Date.UTC(y, m - 1, d);
  const daysSinceCycleStart = Math.round((dateOnly - cycleStart) / 86_400_000);
  return Math.floor(daysSinceCycleStart / 7) + 1;
}

// The [start, end) instants of the billing cycle `now` currently falls
// in — used to decide what's actually "paid for" and safe to show/cancel
// (e.g. the upcoming-sessions list). Kajabi doesn't reliably expose the
// real billing interval (monthly/quarterly/semi-annual/annual all
// exist), so this deliberately always uses a plain 1-month window rather
// than guessing the interval — the safe default per spec section 4,
// never over-showing what's confirmed paid. Falls back to a plain
// calendar month if the student has no billing_anniversary_date at all.
export function currentBillingCycleRange(
  billingAnniversaryDate: string | null | undefined,
  now: Date = new Date(),
): { start: Date; end: Date } {
  if (!billingAnniversaryDate) {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 1)) };
  }

  const anchorDay = new Date(`${billingAnniversaryDate}T00:00:00Z`).getUTCDate();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const d = now.getUTCDate();
  const [cy, cm, cd] = cycleStartForDate(y, m, d, anchorDay);
  const start = new Date(Date.UTC(cy, cm - 1, cd));

  const nextMonth = cm === 12 ? 1 : cm + 1;
  const nextYear = cm === 12 ? cy + 1 : cy;
  const endDay = Math.min(anchorDay, daysInMonth(nextYear, nextMonth));
  const end = new Date(Date.UTC(nextYear, nextMonth - 1, endDay));

  return { start, end };
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
// wall-clock lesson time put. When billingAnniversaryDate is given, any
// occurrence that would be the 5th of that weekday in its billing cycle
// is left out entirely (spec section 4) — no session row is ever
// created for it, rather than creating then hiding one.
export function occurrencesFor(
  dayOfWeek: number,
  startTime: string,
  timeZone: string,
  from: Date,
  weeksAhead = WEEKS_AHEAD,
  billingAnniversaryDate?: string | null,
): Date[] {
  const [hh, mm] = startTime.split(":").map(Number);
  const [y, m, d] = zonedYearMonthDay(from, timeZone);
  const out: Date[] = [];
  const anchorDay = billingAnniversaryDate
    ? new Date(`${billingAnniversaryDate}T00:00:00Z`).getUTCDate()
    : null;

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
    if (instant <= from) continue;

    if (anchorDay !== null) {
      const occurrenceNumber = cycleOccurrenceNumber(instant, anchorDay, timeZone);
      if (occurrenceNumber > CYCLE_SESSION_CAP) continue;
    }

    out.push(instant);
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
    .select("id, student_id, coach_id, day_of_week, start_time, duration_minutes, start_date")
    .eq("active", true);

  if (opts.studentId) query = query.eq("student_id", opts.studentId);
  if (opts.scheduleId) query = query.eq("id", opts.scheduleId);

  const { data: schedules } = await query;
  const now = new Date();
  let created = 0;
  let skipped = 0;

  for (const schedule of schedules ?? []) {
    const [{ data: coach }, { data: student }] = await Promise.all([
      supabase.from("coaches").select("timezone").eq("id", schedule.coach_id).single(),
      supabase
        .from("students")
        .select("billing_anniversary_date")
        .eq("id", schedule.student_id)
        .single(),
    ]);

    const timeZone = coach?.timezone ?? "America/New_York";

    // A schedule change can be set to take effect on a future date (see
    // app/api/admin/recurring-schedule/route.ts) rather than immediately
    // — occurrences before that date belong to whatever pattern created
    // them and are left alone, so materialization never walks earlier
    // than start_date even though it always starts scanning from `now`.
    const startDate = schedule.start_date
      ? new Date(`${schedule.start_date}T00:00:00Z`)
      : null;
    const effectiveFrom = startDate && startDate > now ? startDate : now;

    const instants = occurrencesFor(
      schedule.day_of_week,
      schedule.start_time,
      timeZone,
      effectiveFrom,
      WEEKS_AHEAD,
      student?.billing_anniversary_date,
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

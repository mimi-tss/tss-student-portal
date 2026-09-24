import { zonedTimeToUtc, zonedYearMonthDay } from "@/lib/timezone";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { isHolidayInstant } from "@/lib/scheduling/holidays";
import {
  CYCLE_SESSION_CAP,
  cycleOccurrenceNumber,
  holidayLostInPriorWeeks,
  occurrencesFor,
} from "@/lib/scheduling/recurring";

// Holidays this many days back / ahead (Florida calendar) are evaluated
// on each daily run. Ahead: students get the credit ~2 weeks early so
// they can book it before the closure. Back: catches a holiday admin
// added at the last minute, or a missed cron day.
const WINDOW_BACK_DAYS = 7;
const WINDOW_AHEAD_DAYS = 14;

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Every student gets their 4 lessons a cycle even when a studio holiday
// lands on one. occurrencesFor already moves the lost lesson onto the
// cycle's 5th week when that week exists (one per cycle); this covers
// everything that couldn't be replaced that way — no 5th week in the
// cycle, a 2nd holiday in the same cycle, a biweekly student (no 5th
// week concept), or a 5th-week session that couldn't be created (coach
// busy then) — with a studio-planned credit: no cap, no expiry, same
// redemption flow as every other credit (spec section 5).
//
// "Replaced" is judged by whether the 5th-week session actually exists
// for the student, not just whether it should, so a replacement that
// never materialized falls back to a credit. Must run after
// materializeRecurringSessions in the daily cron.
export async function grantHolidayCredits(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  now: Date = new Date(),
): Promise<{ holidayCreditsGranted: number }> {
  const [ty, tm, td] = zonedYearMonthDay(now, DEFAULT_TIMEZONE);
  const today = Date.UTC(ty, tm - 1, td);
  const windowStart = dateKey(new Date(today - WINDOW_BACK_DAYS * 86_400_000));
  const windowEnd = dateKey(new Date(today + WINDOW_AHEAD_DAYS * 86_400_000));

  const { data: holidays } = await supabase.from("studio_holidays").select("date, label");
  const allHolidayDates = new Set<string>((holidays ?? []).map((h: { date: string }) => h.date));
  const inWindow = (holidays ?? []).filter(
    (h: { date: string }) => h.date >= windowStart && h.date <= windowEnd,
  ) as { date: string; label: string | null }[];
  if (inWindow.length === 0) return { holidayCreditsGranted: 0 };

  const [{ data: schedules }, { data: cancelRequests }, { data: existingCredits }] = await Promise.all([
    supabase
      .from("recurring_schedules")
      .select(
        "id, student_id, day_of_week, start_time, duration_minutes, start_date, cadence, created_at, " +
          "students(billing_anniversary_date, subscription_status, paused_start, paused_end), coaches(timezone)",
      )
      .eq("active", true),
    supabase
      .from("student_requests")
      .select("student_id, effective_date")
      .eq("type", "cancel_subscription")
      .in("status", ["pending", "approved"]),
    supabase
      .from("makeup_credits")
      .select("source_recurring_schedule_id, source_holiday_date")
      .in(
        "source_holiday_date",
        inWindow.map((h) => h.date),
      ),
  ]);

  const cancelCutoff = new Map<string, Date>();
  for (const r of cancelRequests ?? []) {
    if (!r.effective_date) continue;
    const d = new Date(`${r.effective_date}T00:00:00Z`);
    const prev = cancelCutoff.get(r.student_id);
    if (!prev || d < prev) cancelCutoff.set(r.student_id, d);
  }
  const alreadyGranted = new Set(
    (existingCredits ?? []).map(
      (c: { source_recurring_schedule_id: string; source_holiday_date: string }) =>
        `${c.source_recurring_schedule_id}|${c.source_holiday_date}`,
    ),
  );

  const rows = [];
  for (const schedule of schedules ?? []) {
    const student = Array.isArray(schedule.students) ? schedule.students[0] : schedule.students;
    const coach = Array.isArray(schedule.coaches) ? schedule.coaches[0] : schedule.coaches;
    if (!student || student.subscription_status === "cancelled") continue;

    const timeZone = coach?.timezone ?? DEFAULT_TIMEZONE;
    const cadence = schedule.cadence ?? "weekly";
    const startDate = schedule.start_date ? new Date(`${schedule.start_date}T00:00:00Z`) : null;
    const [hh, mm] = schedule.start_time.split(":").map(Number);

    for (const holiday of inWindow) {
      if (alreadyGranted.has(`${schedule.id}|${holiday.date}`)) continue;

      // The lesson this schedule would have had on the holiday, if any —
      // occurrencesFor with no holiday list, so nothing is skipped for
      // the closure itself; the billing-cycle cap and biweekly cadence
      // still apply (a 5th-week or off-week date was never a lesson).
      const scanFrom = new Date(Date.parse(`${holiday.date}T00:00:00Z`) - 2 * 86_400_000);
      const lost = occurrencesFor(
        schedule.day_of_week,
        schedule.start_time,
        timeZone,
        scanFrom,
        1,
        student.billing_anniversary_date,
        undefined,
        cadence,
        startDate,
      ).find((i) => isHolidayInstant(i, new Set([holiday.date])));
      if (!lost) continue;

      if (startDate && lost < startDate) continue;
      if (new Date(schedule.created_at) > lost) continue;
      const cutoff = cancelCutoff.get(schedule.student_id);
      if (cutoff && lost >= cutoff) continue;
      if (student.subscription_status === "paused" && student.paused_start) {
        const pauseStart = new Date(`${student.paused_start}T00:00:00Z`);
        const pauseEnd = student.paused_end ? new Date(`${student.paused_end}T23:59:59.999Z`) : null;
        if (lost >= pauseStart && (pauseEnd === null || lost <= pauseEnd)) continue;
      }

      // Weekly + billing anchor: did the cycle's 5th week absorb this one?
      if (cadence === "weekly" && student.billing_anniversary_date) {
        const anchorDay = new Date(`${student.billing_anniversary_date}T00:00:00Z`).getUTCDate();
        const k = cycleOccurrenceNumber(lost, anchorDay, timeZone);
        const [ly, lm, ld] = zonedYearMonthDay(lost, timeZone);
        const lostDate = new Date(Date.UTC(ly, lm - 1, ld));
        const fifthDate = new Date(lostDate.getTime() + (CYCLE_SESSION_CAP + 1 - k) * 7 * 86_400_000);
        const fifth = zonedTimeToUtc(
          fifthDate.getUTCFullYear(),
          fifthDate.getUTCMonth() + 1,
          fifthDate.getUTCDate(),
          hh,
          mm,
          timeZone,
        );
        // Only the cycle's first lost lesson gets the 5th week.
        const earlierLost = holidayLostInPriorWeeks(lostDate, k - 1, hh, mm, timeZone, allHolidayDates, startDate);
        if (
          !earlierLost &&
          cycleOccurrenceNumber(fifth, anchorDay, timeZone) === CYCLE_SESSION_CAP + 1 &&
          !isHolidayInstant(fifth, allHolidayDates)
        ) {
          const { data: fifthSession } = await supabase
            .from("sessions")
            .select("id")
            .eq("student_id", schedule.student_id)
            .eq("scheduled_at", fifth.toISOString())
            .limit(1)
            .maybeSingle();
          if (fifthSession) continue;
        }
      }

      rows.push({
        student_id: schedule.student_id,
        type: "studio-planned",
        expires_at: null,
        reason: `Studio closed ${holiday.date}${holiday.label ? ` (${holiday.label})` : ""}`,
        duration_minutes: schedule.duration_minutes,
        source_holiday_date: holiday.date,
        source_recurring_schedule_id: schedule.id,
      });
    }
  }

  let granted = 0;
  for (const row of rows) {
    const { error } = await supabase.from("makeup_credits").insert(row);
    if (!error) granted++;
    // 23505 = unique index hit: a concurrent run already granted it.
    else if (error.code !== "23505") console.error("grantHolidayCredits insert failed", row, error.message);
  }
  return { holidayCreditsGranted: granted };
}

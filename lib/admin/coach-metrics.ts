import type { createClient } from "@/lib/supabase/server";
import { zonedTimeToUtc, zonedDayKey, zonedYearMonthDay } from "@/lib/timezone";
import { getCoachGroupLessons } from "@/lib/group-lessons";
import { getHeldRecurringSlots } from "@/lib/scheduling/recurring";
import { resolveWorkingHoursForDate, type CoachHoursSource } from "@/lib/scheduling/working-hours";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type WorkingHours = Record<string, [string, string][]>;

function overlapMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart)) / 60000;
}

// "How much of this coach's schedule is being used" — walks each working-
// hours window, day by day, the same way app/api/booking/slots/route.ts
// walks a coach's open slots. Denominator is bookable time (working hours
// minus blocked time — blocked time was never available, so it shouldn't
// drag utilization down); numerator is that same time actually occupied
// by a session, group lesson, or a paused student's held slot. A
// with-notice cancellation frees the slot back up (matches booking/slots'
// own rule), so it doesn't count as occupied.
function computeUtilization(
  hoursSource: CoachHoursSource,
  timeZone: string,
  rangeStart: Date,
  rangeEnd: Date,
  blocks: { start_at: string; end_at: string }[],
  occupied: { start: number; end: number }[],
): { bookableMinutes: number; occupiedMinutes: number } {
  let bookableMinutes = 0;
  let occupiedMinutes = 0;

  for (let d = new Date(rangeStart); d < rangeEnd; d.setUTCDate(d.getUTCDate() + 1)) {
    // Resolved in the coach's own timezone, not read off the UTC-stepped
    // `d` directly — that can land on a different local calendar date
    // once timezone-shifted.
    const [y, m, day] = zonedYearMonthDay(d, timeZone);
    const dateKey = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayWorkingHours = resolveWorkingHoursForDate(hoursSource, dateKey);
    const dayKey = zonedDayKey(d, timeZone);
    const windows = dayWorkingHours[dayKey] ?? [];
    if (windows.length === 0) continue;

    for (const [start, end] of windows) {
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      const winStart = zonedTimeToUtc(y, m, day, sh, sm, timeZone).getTime();
      const winEnd = zonedTimeToUtc(y, m, day, eh, em, timeZone).getTime();
      if (winEnd <= winStart) continue;

      let blockedInWindow = 0;
      for (const b of blocks) {
        blockedInWindow += overlapMinutes(winStart, winEnd, new Date(b.start_at).getTime(), new Date(b.end_at).getTime());
      }
      const windowMinutes = (winEnd - winStart) / 60000;
      bookableMinutes += Math.max(0, windowMinutes - blockedInWindow);

      for (const o of occupied) {
        occupiedMinutes += overlapMinutes(winStart, winEnd, o.start, o.end);
      }
    }
  }

  return { bookableMinutes, occupiedMinutes };
}

export interface CoachMetrics {
  attendedCount: number;
  noShowCount: number;
  dncStudentCount: number;
  utilizationPct: number;
  coachCount: number;
}

// Attended/no-show counts, distinct DNC students seen, and schedule
// utilization for a coach set (empty = all active) over a date range.
// Extracted from app/api/admin/coach-metrics/route.ts so the Reports
// page (a server component) can call it directly instead of round-
// tripping through its own API route.
export async function computeCoachMetrics(
  supabase: SupabaseClient,
  rangeStart: Date,
  rangeEnd: Date,
  coachIds?: string[],
): Promise<CoachMetrics> {
  let coachQuery = supabase
    .from("coaches")
    .select("id, working_hours, pending_working_hours, pending_effective_date, timezone")
    .eq("active", true);
  if (coachIds && coachIds.length > 0) coachQuery = coachQuery.in("id", coachIds);
  const { data: coaches } = await coachQuery;

  let attendedCount = 0;
  let noShowCount = 0;
  const dncStudentIds = new Set<string>();
  let bookableMinutes = 0;
  let occupiedMinutes = 0;

  await Promise.all(
    (coaches ?? []).map(async (coach) => {
      const [{ data: blocks }, { data: sessions }, groupLessons, heldSlots] = await Promise.all([
        supabase
          .from("coach_blocks")
          .select("start_at, end_at")
          .eq("coach_id", coach.id)
          .lte("start_at", rangeEnd.toISOString())
          .gte("end_at", rangeStart.toISOString()),
        supabase
          .from("sessions")
          .select("scheduled_at, duration_minutes, status, student_id, students(payment_status)")
          .eq("actual_coach_id", coach.id)
          .gte("scheduled_at", rangeStart.toISOString())
          .lt("scheduled_at", rangeEnd.toISOString()),
        getCoachGroupLessons(supabase, coach.id, rangeStart.toISOString(), rangeEnd.toISOString()),
        getHeldRecurringSlots(supabase, coach.id, rangeStart, rangeEnd),
      ]);

      const occupied: { start: number; end: number }[] = [];
      for (const s of sessions ?? []) {
        if (s.status === "cancelled-with-notice") continue;
        const start = new Date(s.scheduled_at).getTime();
        occupied.push({ start, end: start + s.duration_minutes * 60 * 1000 });
        if (s.status === "attended") attendedCount++;
        if (s.status === "no-show" || s.status === "late-forfeit") noShowCount++;
        const paymentStatus = (s.students as unknown as { payment_status: string } | null)?.payment_status;
        if (paymentStatus === "dnc") dncStudentIds.add(s.student_id);
      }
      for (const g of groupLessons) {
        const start = new Date(g.scheduledAt).getTime();
        occupied.push({ start, end: start + g.durationMinutes * 60 * 1000 });
      }
      for (const h of heldSlots) {
        const start = new Date(h.scheduledAt).getTime();
        occupied.push({ start, end: start + h.durationMinutes * 60 * 1000 });
      }

      const util = computeUtilization(
        {
          workingHours: (coach.working_hours ?? {}) as WorkingHours,
          pendingWorkingHours: coach.pending_working_hours as WorkingHours | null,
          pendingEffectiveDate: coach.pending_effective_date,
        },
        coach.timezone ?? "America/New_York",
        rangeStart,
        rangeEnd,
        blocks ?? [],
        occupied,
      );
      bookableMinutes += util.bookableMinutes;
      occupiedMinutes += util.occupiedMinutes;
    }),
  );

  return {
    attendedCount,
    noShowCount,
    dncStudentCount: dncStudentIds.size,
    utilizationPct: bookableMinutes > 0 ? Math.round((occupiedMinutes / bookableMinutes) * 100) : 0,
    coachCount: (coaches ?? []).length,
  };
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCoachGroupLessons } from "@/lib/group-lessons";
import { getHeldRecurringSlots } from "@/lib/scheduling/recurring";
import { resolveWorkingHoursForDate } from "@/lib/scheduling/working-hours";

// Bulk version of /api/admin/coach-schedule — every coach's schedule for
// one day at once, so the Coaches page can show them side by side as
// columns instead of admin picking one coach at a time (that per-coach
// view still exists on the Scheduler page). Same per-coach shape as
// coach-schedule, just looped and returned as an array.
export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  if (!start || !end) {
    return NextResponse.json({ error: "start and end required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: coaches } = await supabase
    .from("coaches")
    .select("id, name, working_hours, pending_working_hours, pending_effective_date, timezone")
    .eq("active", true)
    .order("name");

  // This route always fetches one specific calendar day (start/end are
  // that day's bounds), so the pending-vs-current resolution can happen
  // once here per coach rather than needing per-cell logic downstream.
  const dateKey = start.slice(0, 10);

  const results = await Promise.all(
    (coaches ?? []).map(async (coach) => {
      const [{ data: blocks }, { data: sessions }, groupLessons, heldSlots] = await Promise.all([
        supabase
          .from("coach_blocks")
          .select("id, start_at, end_at, reason")
          .eq("coach_id", coach.id)
          .lte("start_at", end)
          .gte("end_at", start),
        supabase
          .from("sessions")
          .select("id, scheduled_at, duration_minutes, status, is_trial, is_makeup, student_id, students(name)")
          .eq("actual_coach_id", coach.id)
          .gte("scheduled_at", start)
          .lte("scheduled_at", end)
          .not("status", "eq", "cancelled-with-notice"),
        getCoachGroupLessons(supabase, coach.id, start, end),
        getHeldRecurringSlots(supabase, coach.id, new Date(start), new Date(end)),
      ]);

      return {
        coach: {
          id: coach.id,
          name: coach.name,
          workingHours: resolveWorkingHoursForDate(
            {
              workingHours: coach.working_hours,
              pendingWorkingHours: coach.pending_working_hours,
              pendingEffectiveDate: coach.pending_effective_date,
            },
            dateKey,
          ),
          timezone: coach.timezone,
        },
        blocks: blocks ?? [],
        sessions: (sessions ?? []).map((s) => ({
          id: s.id,
          scheduledAt: s.scheduled_at,
          durationMinutes: s.duration_minutes,
          status: s.status,
          isTrial: s.is_trial,
          isMakeup: s.is_makeup,
          studentId: s.student_id,
          studentName: (s.students as unknown as { name: string } | null)?.name ?? "Student",
        })),
        groupLessons,
        heldSlots,
      };
    }),
  );

  return NextResponse.json({ coaches: results });
}

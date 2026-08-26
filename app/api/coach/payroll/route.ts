import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeCoachPayroll } from "@/lib/payroll/calculate";

// Coach's own payroll summary (TSS_App_Spec_1.md section 8: "own payroll
// summary for the pay period"). Coach id is always resolved server-side
// from the session, never trusted from the client, same posture as
// app/api/coach/schedule/route.ts.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: coach } = await supabase
    .from("coaches")
    .select("id")
    .eq("profile_id", user.id)
    .single();
  if (!coach) return NextResponse.json({ error: "no coach record" }, { status: 404 });

  const now = new Date();
  const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

  const periodStart = req.nextUrl.searchParams.get("start") ?? defaultStart;
  const periodEnd = req.nextUrl.searchParams.get("end") ?? defaultEnd;

  const [estimate, { data: finalized }, { data: needsAttendanceSessions }, { data: needsAttendanceGroupRegs }] =
    await Promise.all([
      computeCoachPayroll(supabase, coach.id, periodStart, periodEnd),
      supabase
        .from("payroll_entries")
        .select(
          "id, amount, period_start, period_end, paid, is_manual, reason, sessions(scheduled_at, duration_minutes, students(name)), group_lessons(topic, scheduled_at, duration_minutes)",
        )
        .eq("coach_id", coach.id)
        .lte("period_start", periodEnd)
        .gte("period_end", periodStart)
        .order("period_start", { ascending: false }),
      // Sessions in this range that already happened but the coach hasn't
      // marked yet — feeds "My Schedule"'s clickable "Needs attendance"
      // tile, which expands into this exact list with quick-mark icons,
      // for whatever range the calendar above is currently showing.
      supabase
        .from("sessions")
        .select("id, scheduled_at, duration_minutes, students(name)")
        .eq("actual_coach_id", coach.id)
        .eq("status", "scheduled")
        .gte("scheduled_at", periodStart)
        .lt("scheduled_at", periodEnd)
        .lte("scheduled_at", new Date().toISOString())
        .order("scheduled_at"),
      // Group-lesson attendees still "registered" past the lesson time —
      // same "needs a mark" gap as 1:1 sessions above, just on the other
      // table (attendance is per student, not per lesson).
      supabase
        .from("group_lesson_registrations")
        .select("id, status, group_lessons!inner(id, coach_id, scheduled_at, duration_minutes, topic), students(name)")
        .eq("status", "registered")
        .eq("group_lessons.coach_id", coach.id)
        .is("group_lessons.cancelled_at", null)
        .gte("group_lessons.scheduled_at", periodStart)
        .lt("group_lessons.scheduled_at", periodEnd)
        .lte("group_lessons.scheduled_at", new Date().toISOString())
        .order("id"),
    ]);

  const needsAttendanceGroupLessons = (needsAttendanceGroupRegs ?? []).map((r) => {
    const lesson = r.group_lessons as unknown as {
      scheduled_at: string;
      duration_minutes: number;
      topic: string | null;
    };
    return {
      registrationId: r.id,
      scheduledAt: lesson.scheduled_at,
      durationMinutes: lesson.duration_minutes,
      topic: lesson.topic,
      studentName: (r.students as unknown as { name: string } | null)?.name ?? "Student",
    };
  });

  // Marks every finalized entry just handed back as seen — clears the
  // dashboard's "new payroll" banner (lib/payroll's coach_seen_at) for
  // whatever this coach has actually now had a chance to look at.
  // Service-role write since coaches have no UPDATE policy on
  // payroll_entries (0023's comment: "generating a run and marking
  // paid are admin-only actions") — this route already resolved
  // `coach.id` server-side, so it's safe to write on their behalf for
  // exactly the rows it's returning to them.
  const finalizedIds = (finalized ?? []).map((f) => f.id);
  if (finalizedIds.length > 0) {
    await createAdminClient()
      .from("payroll_entries")
      .update({ coach_seen_at: new Date().toISOString() })
      .in("id", finalizedIds)
      .is("coach_seen_at", null);
  }

  return NextResponse.json({
    periodStart,
    periodEnd,
    estimate,
    needsAttendanceCount: (needsAttendanceSessions?.length ?? 0) + needsAttendanceGroupLessons.length,
    needsAttendanceSessions: (needsAttendanceSessions ?? []).map((s) => ({
      id: s.id,
      scheduledAt: s.scheduled_at,
      durationMinutes: s.duration_minutes,
      studentName: (s.students as unknown as { name: string } | null)?.name ?? "Student",
    })),
    needsAttendanceGroupLessons,
    finalized: (finalized ?? []).map((f) => {
      const session = f.sessions as unknown as {
        scheduled_at: string;
        duration_minutes: number;
        students: { name: string } | null;
      } | null;
      const groupLesson = f.group_lessons as unknown as {
        topic: string | null;
        scheduled_at: string;
        duration_minutes: number;
      } | null;
      return {
        id: f.id,
        amount: f.amount,
        periodStart: f.period_start,
        periodEnd: f.period_end,
        paid: f.paid,
        scheduledAt: session?.scheduled_at ?? groupLesson?.scheduled_at ?? null,
        label: f.is_manual
          ? (f.reason ?? "Adjustment")
          : session
            ? session.students?.name ?? "Student"
            : groupLesson?.topic ?? "Group Lesson",
        isManual: f.is_manual,
      };
    }),
  });
}

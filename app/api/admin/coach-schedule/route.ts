import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Admin equivalent of app/api/coach/schedule — same shape, but for any
// coach (relies on the "admins can view all ..." RLS policies, not just
// "coaches can view their own"), since admin needs to browse every
// coach's calendar, not just their own.
export async function GET(req: NextRequest) {
  const coachId = req.nextUrl.searchParams.get("coachId");
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  if (!coachId || !start || !end) {
    return NextResponse.json({ error: "coachId, start, and end required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: coach } = await supabase
    .from("coaches")
    .select("id, name, working_hours, timezone")
    .eq("id", coachId)
    .single();

  if (!coach) return NextResponse.json({ error: "coach not found" }, { status: 404 });

  const [{ data: blocks }, { data: sessions }] = await Promise.all([
    supabase
      .from("coach_blocks")
      .select("id, start_at, end_at, reason")
      .eq("coach_id", coach.id)
      .lte("start_at", end)
      .gte("end_at", start),
    supabase
      .from("sessions")
      .select("id, scheduled_at, duration_minutes, status, is_trial, students(name)")
      .eq("actual_coach_id", coach.id)
      .gte("scheduled_at", start)
      .lte("scheduled_at", end)
      .not("status", "in", "(cancelled-with-notice,cancelled-no-notice)"),
  ]);

  return NextResponse.json({
    coach: {
      id: coach.id,
      name: coach.name,
      workingHours: coach.working_hours,
      timezone: coach.timezone,
    },
    blocks: blocks ?? [],
    sessions: (sessions ?? []).map((s) => ({
      id: s.id,
      scheduledAt: s.scheduled_at,
      durationMinutes: s.duration_minutes,
      status: s.status,
      isTrial: s.is_trial,
      studentName: (s.students as unknown as { name: string } | null)?.name ?? "Student",
    })),
  });
}

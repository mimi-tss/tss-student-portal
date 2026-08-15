import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Returns the logged-in coach's own working hours, blocks, and sessions
// for a date range — feeds the calendar grid in
// app/(coach)/coach/dashboard. See app/api/admin/coach-schedule for the
// admin equivalent (arbitrary coach, forced to Eastern display).
export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  if (!start || !end) {
    return NextResponse.json({ error: "start and end required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: coach } = await supabase
    .from("coaches")
    .select("id, name, working_hours, timezone")
    .eq("profile_id", user.id)
    .single();

  if (!coach) return NextResponse.json({ error: "no coach record" }, { status: 404 });

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

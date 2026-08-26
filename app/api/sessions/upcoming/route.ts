import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { currentBillingCycleRange } from "@/lib/scheduling/recurring";
import { isAdminRole } from "@/lib/auth/roles";

// Every scheduled session within the caller's current (paid) billing
// cycle — backs the "Show all sessions" list on both the student
// dashboard and the admin per-student page, so either can cancel a
// specific future occurrence in advance rather than only the next one.
// Deliberately bounded to the current cycle: a student can't see or
// cancel sessions in a cycle they haven't paid for yet (spec section 6).
export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not logged in" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const requestedStudentId = req.nextUrl.searchParams.get("studentId");
  const isAdmin = isAdminRole(profile?.role);

  // Only an admin may look up another student's sessions — everyone else
  // always gets their own, regardless of any studentId they pass, since
  // the broader "students can view sessions involving their own coach"
  // RLS policy would otherwise leak other students' schedules here.
  const studentQuery = supabase.from("students").select("id, billing_anniversary_date");
  const { data: student } =
    isAdmin && requestedStudentId
      ? await studentQuery.eq("id", requestedStudentId).maybeSingle()
      : await studentQuery.eq("profile_id", user.id).maybeSingle();

  if (!student) {
    return NextResponse.json({ error: "student not found" }, { status: 404 });
  }

  const studentId = student.id;

  const { end: cycleEnd } = currentBillingCycleRange(student.billing_anniversary_date);

  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("id, scheduled_at, duration_minutes, is_makeup, actual_coach_id")
    .eq("student_id", studentId)
    .eq("status", "scheduled")
    .gte("scheduled_at", new Date().toISOString())
    .lt("scheduled_at", cycleEnd.toISOString())
    .order("scheduled_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sessions: sessions ?? [] });
}

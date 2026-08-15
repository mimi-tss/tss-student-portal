import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Admin assigns/reassigns a student's coach (TSS_App_Spec_1.md section 8).
// Relies on the "admins can update all students" RLS policy
// (0005_trial_lesson_and_coach_admin.sql) rather than the service-role
// client — this route only ever runs for a session that already passed
// the (admin) layout's requireRole("admin") check.
export async function POST(req: NextRequest) {
  const { studentId, coachId } = await req.json();

  if (!studentId || !coachId) {
    return NextResponse.json(
      { error: "studentId and coachId required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("students")
    .update({ assigned_coach_id: coachId })
    .eq("id", studentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Tags a student as referred by a coach (students.referred_by_coach_id)
// — that coach earns REFERRAL_BONUS_PER_HOUR on top of their rate
// whenever they're the one teaching this student (lib/payroll/calculate.ts).
// RLS ("admins can update all students", 0007) enforces the admin-only
// check, same posture as set-birth-date/route.ts.
export async function POST(req: NextRequest) {
  const { studentId, coachId } = await req.json();

  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({ referred_by_coach_id: coachId || null })
    .eq("id", studentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

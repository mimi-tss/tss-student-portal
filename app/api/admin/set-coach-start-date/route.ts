import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// "With you since" override, for students migrated from the old system
// whose real coaching relationship predates any session row in this app
// — see lib/coach/dashboard-data.ts's getStudentSnapshot. RLS ("admins
// can update all students", 0007) enforces the admin-only check.
export async function POST(req: NextRequest) {
  const { studentId, coachStartDate } = await req.json();
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({ coach_start_date_override: coachStartDate || null })
    .eq("id", studentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

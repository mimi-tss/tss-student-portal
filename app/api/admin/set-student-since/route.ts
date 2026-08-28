import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// "Student since" override, for students migrated in (e.g. via CSV bulk
// import) whose real start date predates their row being created here —
// see students.student_since_override (migration 0059). Leaving it blank
// falls back to the row's own created_at, same fallback pattern
// coach_start_date_override uses. RLS ("admins can update all students",
// 0007) enforces the admin-only check.
export async function POST(req: NextRequest) {
  const { studentId, studentSince } = await req.json();
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({ student_since_override: studentSince || null })
    .eq("id", studentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

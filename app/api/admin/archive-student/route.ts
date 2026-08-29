import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Reversible "hide from the active Students list" — as opposed to
// delete-student/route.ts's permanent delete. Every row (sessions,
// credits, payroll history) is left exactly as it is. RLS ("admins can
// update all students", 0007) enforces the admin-only check.
export async function POST(req: NextRequest) {
  const { studentId, archived } = await req.json();

  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({ archived: !!archived })
    .eq("id", studentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Feeds the coach dashboard's "Birthdays this week" reminder — no
// Kajabi field carries this, so it's admin-entered. RLS ("admins can
// update all students", 0007) enforces the admin-only check.
export async function POST(req: NextRequest) {
  const { studentId, birthDate } = await req.json();
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({ birth_date: birthDate || null })
    .eq("id", studentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Admin edit of a minor student's parent/guardian contact info —
// deliberately just fields on the student row, not a second login
// account (Opus1's old "AccountManager" system had full parent
// accounts + a dependent-count linking system; this app doesn't need
// that). Never selected by any coach-facing query
// (lib/coach/dashboard-data.ts) — coach never sees this at all. RLS
// ("admins can update all students", 0007) enforces the admin-only
// check.
export async function POST(req: NextRequest) {
  const { studentId, name, relationship, phone, email } = await req.json();

  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({
      guardian_name: name?.trim() || null,
      guardian_relationship: relationship?.trim() || null,
      guardian_phone: phone?.trim() || null,
      guardian_email: email?.trim() || null,
    })
    .eq("id", studentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

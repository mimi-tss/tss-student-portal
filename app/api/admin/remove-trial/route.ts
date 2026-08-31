import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Admin removes an unused trial-lesson entitlement — e.g. a migrated
// Suite student (CSV import, tier=suite) who already has real session
// history and doesn't need the trial lesson provisionStudent() auto-
// grants every new Suite student. RLS ("admins can delete entitlements",
// migration 0079) enforces the admin-only check. Only ever targets an
// unused entitlement — a used one already became a real booked session,
// nothing left here to undo.
export async function POST(req: NextRequest) {
  const { studentId } = await req.json();

  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("entitlements")
    .delete({ count: "exact" })
    .eq("student_id", studentId)
    .eq("perk_type", "trial_lesson")
    .eq("used", false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // RLS silently filters rows the caller isn't scoped to rather than
  // erroring — a 0-row delete means "not found or not yours", not success.
  if (!count) {
    return NextResponse.json({ error: "No unused trial lesson to remove for this student." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

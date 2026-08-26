import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Corrects the auto-computed "last session" shown on a pending/approved
// cancellation (migration 0038) — the real last session sometimes moves
// (a makeup, a reschedule) and admin needs to reflect that without
// touching the request's other fields. RLS ("admins can manage all
// requests", 0034) enforces the admin-only check.
export async function POST(req: NextRequest) {
  const { studentId, lastSessionDate } = await req.json();
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("student_requests")
    .select("id")
    .eq("student_id", studentId)
    .eq("type", "cancel_subscription")
    .in("status", ["pending", "approved"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!request) {
    return NextResponse.json({ error: "No active cancellation for this student." }, { status: 404 });
  }

  const { error } = await supabase
    .from("student_requests")
    .update({ last_session_override: lastSessionDate || null })
    .eq("id", request.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

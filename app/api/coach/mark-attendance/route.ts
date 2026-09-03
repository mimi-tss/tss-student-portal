import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { flagConsecutiveMisses } from "@/lib/admin/attention-items";

// Coaches' one scheduling-adjacent write action (TSS_App_Spec_1.md
// section 8). Relies on the "coaches can update their own sessions" RLS
// policy (0010 migration) to enforce a coach can only mark attendance on
// their own sessions — not passed as a parameter here, checked by the
// database, not this route.
const ALLOWED_STATUSES = ["attended", "no-show", "late-forfeit"] as const;

export async function POST(req: NextRequest) {
  const { sessionId, status } = await req.json();

  if (!sessionId || !ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sessions")
    .update({ status })
    .eq("id", sessionId)
    .select("id, student_id, students(name)")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    // RLS silently filters out rows the coach doesn't own, rather than
    // erroring — a null result means either the session doesn't exist or
    // it isn't this coach's to mark.
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  if (status === "no-show" || status === "late-forfeit") {
    const studentName = (data.students as unknown as { name: string } | null)?.name ?? "Student";
    await flagConsecutiveMisses(createAdminClient(), data.student_id, studentName, sessionId);
  }

  return NextResponse.json({ success: true });
}

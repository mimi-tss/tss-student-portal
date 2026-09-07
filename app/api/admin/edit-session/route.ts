import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_STATUSES = [
  "scheduled",
  "attended",
  "no-show",
  "late-forfeit",
  "cancelled-with-notice",
  "cancelled-no-notice",
] as const;

// Raw correction tool for a session's record — unlike cancel-session and
// staff-cancel-session, this touches no credits/makeup_credits and works
// regardless of the session's current status: fixing a coach's mis-marked
// attendance, a wrong date/time, or the wrong coach after the fact. The
// automatic audit_log trigger (0064) already captures the field-level
// diff; `note` is optional human context on top of that, logged to
// admin_overrides the same way staff-cancel does. Relies on "admins can
// update all sessions" RLS (0017).
export async function POST(req: NextRequest) {
  const { sessionId, scheduledAt, durationMinutes, coachId, status, note } = await req.json();

  if (
    !sessionId ||
    !scheduledAt ||
    !durationMinutes ||
    !coachId ||
    !VALID_STATUSES.includes(status)
  ) {
    return NextResponse.json(
      { error: "sessionId, scheduledAt, durationMinutes, coachId, and a valid status are required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: session } = await supabase
    .from("sessions")
    .select("id, student_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("sessions")
    .update({
      scheduled_at: scheduledAt,
      duration_minutes: durationMinutes,
      actual_coach_id: coachId,
      status,
    })
    .eq("id", sessionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (note?.trim()) {
    const { error: overrideError } = await supabase.from("admin_overrides").insert({
      student_id: session.student_id,
      admin_profile_id: user.id,
      override_type: "edit-session",
      note: note.trim(),
    });

    if (overrideError) {
      return NextResponse.json(
        { error: `session updated but the audit note failed: ${overrideError.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ success: true });
}

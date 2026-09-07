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

// Manually backfills a session record this app never created itself — the
// case that prompted this: a student's late cancellation happened entirely
// in the old app (Opus) before this student's history lived here, so there
// was no row to correct, only a fact to log. A plain insert: no makeup
// credit, no coach notification, no payroll side effect (payroll's own
// generate step picks up an 'attended' row on its own next run) — this
// records something that already happened, not a live booking action.
// Relies on "admins can insert sessions" RLS (0007).
export async function POST(req: NextRequest) {
  const { studentId, coachId, scheduledAt, durationMinutes, status, note } = await req.json();

  if (
    !studentId ||
    !coachId ||
    !scheduledAt ||
    !durationMinutes ||
    !VALID_STATUSES.includes(status)
  ) {
    return NextResponse.json(
      { error: "studentId, coachId, scheduledAt, durationMinutes, and a valid status are required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: inserted, error } = await supabase
    .from("sessions")
    .insert({
      student_id: studentId,
      actual_coach_id: coachId,
      scheduled_at: scheduledAt,
      duration_minutes: durationMinutes,
      status,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (note?.trim()) {
    const { error: overrideError } = await supabase.from("admin_overrides").insert({
      student_id: studentId,
      admin_profile_id: user.id,
      override_type: "add-past-session",
      note: note.trim(),
    });

    if (overrideError) {
      return NextResponse.json(
        { error: `session added but the audit note failed: ${overrideError.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ success: true, id: inserted.id });
}

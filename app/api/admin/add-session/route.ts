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
// was no row to correct, only a fact to log. A plain insert: no coach
// notification, no payroll side effect (payroll's own generate step picks
// up an 'attended' row on its own next run) — this records something that
// already happened, not a live booking action.
//
// `creditId` is optional and only meaningful here: the backfilled session
// may have already spent a credit back in the old app, which this app
// would otherwise still show as unused. Marks it used exactly like the
// live booking flow does (app/api/booking/book/route.ts) — never grants or
// creates one, only spends an existing unused credit.
// Relies on "admins can insert sessions" RLS (0007).
export async function POST(req: NextRequest) {
  const { studentId, coachId, scheduledAt, durationMinutes, status, note, creditId } = await req.json();

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

  let credit: { id: string; duration_minutes: number | null } | null = null;
  if (creditId) {
    const { data: creditRow } = await supabase
      .from("makeup_credits")
      .select("id, duration_minutes")
      .eq("id", creditId)
      .eq("student_id", studentId)
      .eq("used", false)
      .maybeSingle();

    if (!creditRow) {
      return NextResponse.json(
        { error: "that credit is no longer available to spend" },
        { status: 409 },
      );
    }
    credit = creditRow;
  }

  const { data: inserted, error } = await supabase
    .from("sessions")
    .insert({
      student_id: studentId,
      actual_coach_id: coachId,
      scheduled_at: scheduledAt,
      duration_minutes: durationMinutes,
      status,
      is_makeup: !!credit,
      makeup_credit_id: credit?.id ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (credit) {
    const { error: creditError } = await supabase
      .from("makeup_credits")
      .update({ used: true, used_session_id: inserted.id })
      .eq("id", credit.id);

    if (creditError) {
      return NextResponse.json(
        { error: `session added but marking the credit used failed: ${creditError.message}` },
        { status: 500 },
      );
    }
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

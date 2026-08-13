import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Self-service booking: student claims an open slot against their own
// assigned coach, optionally redeeming a makeup credit. See
// TSS_App_Spec_1.md section 5 for the three credit types.
//
// TODO: this checks that a *given* credit is valid to redeem (belongs to
// the student, unused, unexpired) — it does not enforce the 1/month, 6/year
// cap on how many student-fault credits get *issued* in the first place.
// That cap belongs in whatever flow grants credits (cancellation/no-show
// handling), which isn't built yet.
export async function POST(req: NextRequest) {
  const { studentId, slotStart, makeupCreditId } = await req.json();

  if (!studentId || !slotStart) {
    return NextResponse.json(
      { error: "studentId and slotStart required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("assigned_coach_id")
    .eq("id", studentId)
    .single();

  if (!student?.assigned_coach_id) {
    return NextResponse.json({ error: "no assigned coach" }, { status: 400 });
  }

  let credit: { id: string } | null = null;

  if (makeupCreditId) {
    const { data: creditRow } = await supabase
      .from("makeup_credits")
      .select("id, student_id, used, expires_at")
      .eq("id", makeupCreditId)
      .maybeSingle();

    if (!creditRow || creditRow.student_id !== studentId) {
      return NextResponse.json({ error: "makeup credit not found" }, { status: 404 });
    }
    if (creditRow.used) {
      return NextResponse.json(
        { error: "makeup credit already used" },
        { status: 409 },
      );
    }
    if (creditRow.expires_at && new Date(creditRow.expires_at) < new Date()) {
      return NextResponse.json({ error: "makeup credit expired" }, { status: 409 });
    }

    credit = creditRow;
  }

  // Re-check the slot is still free — another student could have claimed it
  // between the slots fetch and this request.
  const { data: clash } = await supabase
    .from("sessions")
    .select("id")
    .eq("actual_coach_id", student.assigned_coach_id)
    .eq("scheduled_at", slotStart)
    .maybeSingle();

  if (clash) {
    return NextResponse.json({ error: "slot no longer available" }, { status: 409 });
  }

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({
      student_id: studentId,
      actual_coach_id: student.assigned_coach_id,
      scheduled_at: slotStart,
      duration_minutes: 30,
      status: "scheduled",
      is_makeup: !!credit,
      makeup_credit_id: credit?.id ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (credit) {
    // Not atomic with the session insert above — if this update fails the
    // session still exists but the credit stays unspent. Acceptable for now;
    // move both writes into a single Postgres function if that gap matters
    // before this goes live with real students.
    const { error: creditError } = await supabase
      .from("makeup_credits")
      .update({ used: true, used_session_id: session.id })
      .eq("id", credit.id);

    if (creditError) {
      return NextResponse.json(
        { error: `session booked but credit update failed: ${creditError.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ success: true });
}

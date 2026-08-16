import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const NOTICE_HOURS = 24;
const CREDIT_EXPIRY_DAYS = 30;

// Self-service cancellation (spec section 5/6): cancelling 24+ hours before
// the session earns a student-fault makeup credit (capped 1/month, 6/year
// — enforced by the makeup_credits insert RLS policy in migration 0012,
// not duplicated here). Inside the 24-hour window, or once the student is
// already at cap, the session is marked cancelled-no-notice instead — no
// credit, coach still paid per the no-refund policy.
//
// Exception: if the session being cancelled was itself a makeup session
// (booked by spending a credit), a with-notice cancellation reinstates
// that same credit instead of trying to mint a new one — this is a
// reschedule of an existing make-good, not a fresh student-fault event,
// so it doesn't touch the monthly/yearly cap.
export async function POST(req: NextRequest) {
  const { sessionId } = await req.json();

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not logged in" }, { status: 401 });
  }

  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("profile_id", user.id)
    .single();

  if (!student) {
    return NextResponse.json({ error: "student not found" }, { status: 404 });
  }

  const { data: session } = await supabase
    .from("sessions")
    .select("id, student_id, scheduled_at, status, is_makeup, makeup_credit_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session || session.student_id !== student.id) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }
  if (session.status !== "scheduled") {
    return NextResponse.json({ error: "session is not scheduled" }, { status: 409 });
  }

  const scheduledAt = new Date(session.scheduled_at);
  if (scheduledAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "session has already passed" }, { status: 409 });
  }

  const hoursNotice = (scheduledAt.getTime() - Date.now()) / (60 * 60 * 1000);
  const withinNoticeWindow = hoursNotice >= NOTICE_HOURS;

  let creditGranted = false;
  let creditReinstated = false;
  let creditExpiresAt: string | null = null;

  if (withinNoticeWindow && session.is_makeup && session.makeup_credit_id) {
    const { data: reinstated, error: reinstateError } = await supabase
      .from("makeup_credits")
      .update({ used: false, used_session_id: null })
      .eq("id", session.makeup_credit_id)
      .select("expires_at")
      .maybeSingle();

    if (!reinstateError && reinstated) {
      creditGranted = true;
      creditReinstated = true;
      creditExpiresAt = reinstated.expires_at;
    }
  } else if (withinNoticeWindow) {
    const expiresAt = new Date(
      scheduledAt.getTime() + CREDIT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Fails (RLS violation) once the student is already at their monthly/
    // yearly cap — that's expected, not an error worth surfacing; it just
    // means no credit this time, and cancellation still proceeds below.
    const { error: creditError } = await supabase.from("makeup_credits").insert({
      student_id: student.id,
      type: "student-fault",
      source_session_id: session.id,
      expires_at: expiresAt,
    });

    if (!creditError) {
      creditGranted = true;
      creditExpiresAt = expiresAt;
    }
  }

  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      status: creditGranted ? "cancelled-with-notice" : "cancelled-no-notice",
    })
    .eq("id", session.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const message = creditReinstated
    ? "Session cancelled — your makeup credit has been given back to you, so you can reschedule."
    : creditGranted
      ? "Session cancelled — you've earned a makeup credit, good for 30 days."
      : "Session cancelled. This one didn't earn a makeup credit (inside the 24-hour notice window, or you're already at your credit limit for this period), but you can still book a new time.";

  return NextResponse.json({ creditGranted, creditReinstated, creditExpiresAt, message });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyCancellationCredit, cancellationMessage } from "@/lib/booking/cancel-session";
import { currentBillingCycleRange } from "@/lib/scheduling/recurring";
import { notifyCoachSessionEvent } from "@/lib/notifications/session-events";

// Admin-triggered version of the student's own self-service cancel — same
// rules either way (see lib/booking/cancel-session.ts), just reachable
// for any student's session rather than only the logged-in student's
// own. Distinct from "staff cancel" (see staff-cancel-session/route.ts),
// which always grants a credit uncapped and requires a logged reason.
export async function POST(req: NextRequest) {
  const { sessionId, reason } = await req.json();

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, student_id, scheduled_at, duration_minutes, status, is_makeup, makeup_credit_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }
  if (session.status !== "scheduled") {
    return NextResponse.json({ error: "session is not scheduled" }, { status: 409 });
  }

  // Mirrors the self-service guard exactly (spec section 6) — "regular
  // cancel" follows the same makeup rules as the student's own
  // cancellation, including that a future/unpaid billing cycle can't be
  // cancelled yet. Staff-cancel is the deliberate override for this.
  const { data: student } = await supabase
    .from("students")
    .select("billing_anniversary_date")
    .eq("id", session.student_id)
    .single();

  const { end: cycleEnd } = currentBillingCycleRange(student?.billing_anniversary_date);
  if (new Date(session.scheduled_at).getTime() >= cycleEnd.getTime()) {
    return NextResponse.json(
      { error: "This session is in a future billing cycle and can't be cancelled yet." },
      { status: 403 },
    );
  }

  const outcome = await applyCancellationCredit(supabase, session, reason);

  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      status: outcome.creditGranted ? "cancelled-with-notice" : "cancelled-no-notice",
    })
    .eq("id", session.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  notifyCoachSessionEvent(session.id, "session_cancelled").catch((err) =>
    console.error(`cancellation notification failed for session ${session.id}`, err),
  );

  return NextResponse.json({ ...outcome, message: cancellationMessage(outcome) });
}

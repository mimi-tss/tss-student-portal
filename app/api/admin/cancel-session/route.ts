import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyCancellationCredit, cancellationMessage } from "@/lib/booking/cancel-session";

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

  return NextResponse.json({ ...outcome, message: cancellationMessage(outcome) });
}

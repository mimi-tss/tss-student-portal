import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyCancellationCredit, cancellationMessage } from "@/lib/booking/cancel-session";

// Self-service cancellation (spec section 5/6) — see
// lib/booking/cancel-session.ts for the actual notice/credit rules,
// shared with the admin "regular cancel" route. This just resolves and
// checks ownership of the session, then updates its status afterward.
export async function POST(req: NextRequest) {
  const { sessionId, reason } = await req.json();

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
    .select("id, student_id, scheduled_at, duration_minutes, status, is_makeup, makeup_credit_id")
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

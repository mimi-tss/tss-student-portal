import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyCancellationCredit, cancellationMessage } from "@/lib/booking/cancel-session";
import { currentBillingCycleRange } from "@/lib/scheduling/recurring";
import { flagConsecutiveMisses } from "@/lib/admin/attention-items";

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
    .select("id, name, billing_anniversary_date")
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

  // Only the current billing cycle is actually paid for — a session in a
  // future cycle can't be cancelled for a credit that hasn't been earned
  // yet. Doesn't apply to staff-cancel, which is an admin override.
  const { end: cycleEnd } = currentBillingCycleRange(student.billing_anniversary_date);
  if (scheduledAt.getTime() >= cycleEnd.getTime()) {
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

  if (!outcome.creditGranted) {
    await flagConsecutiveMisses(createAdminClient(), student.id, student.name);
  }

  return NextResponse.json({ ...outcome, message: cancellationMessage(outcome) });
}

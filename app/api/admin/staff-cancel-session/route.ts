import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Staff-initiated cancellation — studio-side reasons (coach emergency,
// scheduling error, goodwill), not the student's fault: always issues a
// session credit, never counted against the student's 1/month or 6/year
// self-service cap, and requires a reason logged to admin_overrides for
// audit (spec section 5: "Admin can override any makeup restriction ...
// logged with a required note"). If the cancelled session was itself
// booked with a credit, gives back that same credit instead of minting a
// new one — same reasoning as the regular cancel path, just without the
// notice-window gate (staff cancel always grants, regardless of timing).
export async function POST(req: NextRequest) {
  const { sessionId, reason } = await req.json();

  if (!sessionId || !reason || !reason.trim()) {
    return NextResponse.json(
      { error: "sessionId and a reason are required" },
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
    .select("id, student_id, duration_minutes, status, is_makeup, makeup_credit_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }
  if (session.status !== "scheduled") {
    return NextResponse.json({ error: "session is not scheduled" }, { status: 409 });
  }

  let creditReinstated = false;
  let creditExpiresAt: string | null = null;

  if (session.is_makeup && session.makeup_credit_id) {
    const { data: reinstated, error: reinstateError } = await supabase
      .from("makeup_credits")
      .update({ used: false, used_session_id: null, reason: reason.trim() })
      .eq("id", session.makeup_credit_id)
      .select("expires_at")
      .maybeSingle();

    if (reinstateError) {
      return NextResponse.json({ error: reinstateError.message }, { status: 500 });
    }
    creditReinstated = true;
    creditExpiresAt = reinstated?.expires_at ?? null;
  } else {
    const { error: creditError } = await supabase.from("makeup_credits").insert({
      student_id: session.student_id,
      type: "studio-emergency",
      source_session_id: session.id,
      expires_at: null,
      reason: reason.trim(),
      duration_minutes: session.duration_minutes,
    });

    if (creditError) {
      return NextResponse.json({ error: creditError.message }, { status: 500 });
    }
  }

  const { error: updateError } = await supabase
    .from("sessions")
    .update({ status: "cancelled-with-notice" })
    .eq("id", session.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: overrideError } = await supabase.from("admin_overrides").insert({
    student_id: session.student_id,
    admin_profile_id: user.id,
    override_type: "staff-cancel",
    note: reason.trim(),
  });

  if (overrideError) {
    return NextResponse.json(
      { error: `session cancelled but the audit log entry failed: ${overrideError.message}` },
      { status: 500 },
    );
  }

  const message = creditReinstated
    ? "Session cancelled — the session credit used to book this has been given back."
    : "Session cancelled — a session credit was issued (no cap, no expiry), and the reason was logged.";

  return NextResponse.json({ creditReinstated, creditExpiresAt, message });
}

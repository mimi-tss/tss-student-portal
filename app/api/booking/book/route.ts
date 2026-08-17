import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Booking a slot — either a regular (Pro/Elite) recurring/session-credit
// booking against a student's own assigned coach, or the one exception,
// a Suite-tier student's one-time trial lesson against any coach. Used
// by both the student's own self-service page and the admin
// book-on-behalf-of page. See TSS_App_Spec_1.md sections 2 and 5.
export async function POST(req: NextRequest) {
  const {
    studentId,
    slotStart,
    makeupCreditId,
    trial,
    coachId: requestedCoachId,
  } = await req.json();

  if (!studentId || !slotStart) {
    return NextResponse.json(
      { error: "studentId and slotStart required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("assigned_coach_id, tier, session_duration_minutes")
    .eq("id", studentId)
    .single();

  if (!student) {
    return NextResponse.json({ error: "student not found" }, { status: 404 });
  }

  let coachId: string;
  let trialEntitlementId: string | null = null;
  let credit: { id: string; duration_minutes: number | null } | null = null;

  if (trial) {
    if (!requestedCoachId) {
      return NextResponse.json(
        { error: "coachId required for a trial booking" },
        { status: 400 },
      );
    }

    const { data: entitlement } = await supabase
      .from("entitlements")
      .select("id, used")
      .eq("student_id", studentId)
      .eq("perk_type", "trial_lesson")
      .maybeSingle();

    if (!entitlement || entitlement.used) {
      return NextResponse.json({ error: "no trial lesson available" }, { status: 409 });
    }

    coachId = requestedCoachId;
    trialEntitlementId = entitlement.id;
  } else {
    if (!student.assigned_coach_id) {
      return NextResponse.json({ error: "no assigned coach" }, { status: 400 });
    }
    coachId = student.assigned_coach_id;

    if (makeupCreditId) {
      const { data: creditRow } = await supabase
        .from("makeup_credits")
        .select("id, student_id, used, expires_at, duration_minutes")
        .eq("id", makeupCreditId)
        .maybeSingle();

      if (!creditRow || creditRow.student_id !== studentId) {
        return NextResponse.json({ error: "session credit not found" }, { status: 404 });
      }
      if (creditRow.used) {
        return NextResponse.json(
          { error: "session credit already used" },
          { status: 409 },
        );
      }
      if (creditRow.expires_at && new Date(creditRow.expires_at) < new Date()) {
        return NextResponse.json({ error: "session credit expired" }, { status: 409 });
      }
      // The slot itself must fall within the credit's window, not just "not
      // expired as of right now" — otherwise a credit could be locked onto
      // a session booked arbitrarily far in the future, or kept alive
      // indefinitely via repeated cancel-and-rebook cycles that each land
      // just before the (fixed, never-extended) expiry date.
      if (creditRow.expires_at && new Date(slotStart) > new Date(creditRow.expires_at)) {
        return NextResponse.json(
          { error: "that time is past your session credit's expiry — please pick an earlier slot" },
          { status: 409 },
        );
      }

      credit = creditRow;
    } else if (student.tier !== "pro" && student.tier !== "elite") {
      // A credit (e.g. the Stripe-only purchased-addon type, section 5) is
      // its own entitlement regardless of base tier — only a *non*-credit
      // regular booking is gated to Pro/Elite. Suite-tier students without
      // an available trial or credit are otherwise view-only.
      return NextResponse.json(
        { error: "your plan doesn't include new bookings" },
        { status: 403 },
      );
    }
  }

  // Re-check the slot is still free — another student could have claimed it
  // between the slots fetch and this request.
  const { data: clash } = await supabase
    .from("sessions")
    .select("id")
    .eq("actual_coach_id", coachId)
    .eq("scheduled_at", slotStart)
    .maybeSingle();

  if (clash) {
    return NextResponse.json({ error: "slot no longer available" }, { status: 409 });
  }

  // Trial lessons are always a fixed 30 min regardless of the student's
  // entitled duration — the 60-min add-on is Pro/Elite-only and mutually
  // exclusive with the Suite-tier trial. A credit's own duration (e.g. a
  // purchased 60-min add-on) takes priority over the student's ambient
  // plan setting when one is being redeemed.
  const durationMinutes = trial
    ? 30
    : (credit?.duration_minutes ?? student.session_duration_minutes ?? 30);

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({
      student_id: studentId,
      actual_coach_id: coachId,
      scheduled_at: slotStart,
      duration_minutes: durationMinutes,
      status: "scheduled",
      is_makeup: !!credit,
      makeup_credit_id: credit?.id ?? null,
      is_trial: !!trialEntitlementId,
      trial_entitlement_id: trialEntitlementId,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Neither of these is atomic with the session insert above — if either
  // update fails the session still exists but the credit/entitlement
  // stays unspent. Acceptable for now; move both writes into a single
  // Postgres function if that gap matters before this goes live.
  if (credit) {
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

  if (trialEntitlementId) {
    const { error: entitlementError } = await supabase
      .from("entitlements")
      .update({ used: true, used_session_id: session.id })
      .eq("id", trialEntitlementId);

    if (entitlementError) {
      return NextResponse.json(
        {
          error: `session booked but entitlement update failed: ${entitlementError.message}`,
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ success: true });
}

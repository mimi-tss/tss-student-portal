import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";

// Booking a slot — a session-credit booking against the student's own
// assigned coach, or the one exception, a Suite-tier student's one-time
// trial lesson against any coach. Used by both the student's own
// self-service page and the admin book-on-behalf-of page. See
// TSS_App_Spec_1.md sections 2 and 5.
//
// Self-service booking ALWAYS requires a credit: a student's regular
// weekly sessions come from their admin-set recurring schedule, not from
// self-booking, so the only thing a student books here is a credit
// redemption. Admin is exempt (admin ⊇ student) and can book a plain
// session on a student's behalf.
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not logged in" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = isAdminRole(profile?.role);

  const { data: student } = await supabase
    .from("students")
    .select("assigned_coach_id, tier, session_duration_minutes, subscription_status")
    .eq("id", studentId)
    .single();

  if (!student) {
    return NextResponse.json({ error: "student not found" }, { status: 404 });
  }

  // A paused student can't attend anything, credit-funded or not — they
  // have to be active again to use a makeup credit (spec: "must use
  // their makeups while active"). Admin can still override for a
  // one-off exception, same "admin ⊇ student" exemption this route
  // already grants for the credit-required rule below.
  if (!isAdmin && student.subscription_status === "paused") {
    return NextResponse.json(
      { error: "Your account is paused — sessions and makeup credits can't be booked until you're active again." },
      { status: 403 },
    );
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
    // Admin ⊇ student: admin can book against any coach, not just the
    // student's assigned one (e.g. redeeming a makeup with a substitute)
    // — students always book against their own assigned coach only.
    if (isAdmin && requestedCoachId) {
      coachId = requestedCoachId;
    } else {
      if (!student.assigned_coach_id) {
        return NextResponse.json({ error: "no assigned coach" }, { status: 400 });
      }
      coachId = student.assigned_coach_id;
    }

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
    } else if (!isAdmin) {
      // A credit is its own entitlement regardless of base tier, and it's
      // the *only* way a student self-books: plan-included weekly
      // sessions come from the admin-set recurring schedule instead, so
      // there's nothing legitimate for a student to book without one.
      return NextResponse.json(
        {
          error:
            "booking requires a session credit — contact the studio to change your regular weekly time",
        },
        { status: 403 },
      );
    }
  }

  // Re-check the slot is still free — another student could have claimed it
  // between the slots fetch and this request. Must exclude cancelled
  // sessions the same way the slots endpoint does, or a cancelled session
  // permanently blocks that exact time from ever being rebooked by anyone.
  const { data: clash } = await supabase
    .from("sessions")
    .select("id")
    .eq("actual_coach_id", coachId)
    .eq("scheduled_at", slotStart)
    .not("status", "in", "(cancelled-with-notice,cancelled-no-notice)")
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

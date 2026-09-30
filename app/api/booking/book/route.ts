import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole } from "@/lib/auth/roles";
import { getHolidayDateKeys, isHolidayInstant } from "@/lib/scheduling/holidays";
import { notifyCoachSessionEvent } from "@/lib/notifications/session-events";
import { canBookLessons } from "@/lib/billing/subscription-gate";
import { getHeldRecurringSlots } from "@/lib/scheduling/recurring";
import { notifyStudentSessionBooked } from "@/lib/notifications/booking-events";

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
    notifyStudent: notifyRequested = true,
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
    .select("assigned_coach_id, tier, session_duration_minutes, subscription_status, payment_status")
    .eq("id", studentId)
    .single();

  if (!student) {
    return NextResponse.json({ error: "student not found" }, { status: 404 });
  }

  // A paused, cancelled, or past-due (DNC) student can't attend anything,
  // credit-funded or not — they have to be in good standing again to use
  // a makeup credit (spec: "must use their makeups while active"). Same
  // gate the billing kill-switch is built around
  // (lib/billing/subscription-gate.ts) — this route is its first real
  // caller. Cancelled/DNC used to fall through this check entirely
  // (only "paused" was ever tested), a real gap now closed. Admin can
  // still override for a one-off exception, same "admin ⊇ student"
  // exemption this route already grants for the credit-required rule
  // below.
  if (!isAdmin) {
    const gate = canBookLessons(student);
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.reason }, { status: 403 });
    }
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
      .select("id, used, coach_id")
      .eq("student_id", studentId)
      .eq("perk_type", "trial_lesson")
      .maybeSingle();

    if (!entitlement || entitlement.used) {
      return NextResponse.json({ error: "no trial lesson available" }, { status: 409 });
    }

    // A trial granted for a specific coach (migration 0093 — e.g. a
    // student who paid extra for a trial with Tara specifically) can
    // only ever be booked against that coach — never trust the client's
    // own requestedCoachId over what was actually granted.
    if (entitlement.coach_id && entitlement.coach_id !== requestedCoachId) {
      return NextResponse.json(
        { error: "this trial lesson was granted for a specific coach" },
        { status: 409 },
      );
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

  // The studio is closed on studio_holidays dates (migration 0055) —
  // hard block, no admin override, since "make sure no one is scheduled"
  // is exactly the point. The studio itself is in Florida, so this is
  // always checked against that fixed zone (isHolidayInstant), not
  // whichever zone this particular coach happens to be in.
  const holidayDates = await getHolidayDateKeys(supabase);
  if (isHolidayInstant(new Date(slotStart), holidayDates)) {
    return NextResponse.json({ error: "The studio is closed that day — no sessions can be booked." }, { status: 409 });
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
    .not("status", "in", "(cancelled-with-notice,cancelled-no-notice,holiday)")
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

  // Same re-check for the coach's own group lessons — /api/booking/slots
  // already excludes these from what it offers (confirmed live: it
  // didn't, a real gap, fixed alongside this), but this route's own
  // write path never independently verified it, so a stale slot list or
  // a direct request could still double-book a coach into their own
  // group class. A group lesson's start isn't grid-aligned like a 1:1
  // session's, so this is a real overlap check, not an exact-match one —
  // fetch anything within a generous window around the requested slot
  // and compare in JS, same reasoning coach-calendar.tsx's own overlap
  // checks already use.
  const slotStartDate = new Date(slotStart);
  const slotEndDate = new Date(slotStartDate.getTime() + durationMinutes * 60 * 1000);
  // Service-role read: group lessons are RLS-hidden from students unless
  // they're registered, so the student's own session saw nothing here
  // and this check never fired for them (see /api/booking/slots). Also
  // covers the student's own group classes with any coach.
  const admin = createAdminClient();
  const windowStartIso = new Date(slotStartDate.getTime() - 4 * 60 * 60 * 1000).toISOString();
  const [{ data: nearbyGroupLessons }, { data: ownGroupRegs }] = await Promise.all([
    admin
      .from("group_lessons")
      .select("scheduled_at, duration_minutes")
      .eq("coach_id", coachId)
      .is("cancelled_at", null)
      .gte("scheduled_at", windowStartIso)
      .lte("scheduled_at", slotEndDate.toISOString()),
    admin
      .from("group_lesson_registrations")
      .select("group_lessons!inner(scheduled_at, duration_minutes, cancelled_at)")
      .eq("student_id", studentId)
      .is("group_lessons.cancelled_at", null)
      .gte("group_lessons.scheduled_at", windowStartIso)
      .lte("group_lessons.scheduled_at", slotEndDate.toISOString()),
  ]);
  const ownGroupLessons = (ownGroupRegs ?? []).flatMap((r) => {
    const g = r.group_lessons as unknown as
      | { scheduled_at: string; duration_minutes: number }
      | { scheduled_at: string; duration_minutes: number }[]
      | null;
    return Array.isArray(g) ? g : g ? [g] : [];
  });

  const groupClash = [...(nearbyGroupLessons ?? []), ...ownGroupLessons].some((g) => {
    const gStart = new Date(g.scheduled_at);
    const gEnd = new Date(gStart.getTime() + g.duration_minutes * 60 * 1000);
    return slotStartDate < gEnd && slotEndDate > gStart;
  });

  if (groupClash) {
    return NextResponse.json({ error: "slot no longer available" }, { status: 409 });
  }

  // Full overlap re-check against everything /api/booking/slots treats as
  // busy — the exact-start-time session check above misses a partial
  // overlap (a 60-min booking at 2:00 over someone's 2:30), and time off
  // or a paused student's held slot were never re-checked at write time
  // at all, so a booking page left open while those changed could still
  // land on them.
  const [{ data: nearbySessions }, { data: nearbyBlocks }, heldSlots] = await Promise.all([
    admin
      .from("sessions")
      .select("scheduled_at, duration_minutes")
      .eq("actual_coach_id", coachId)
      .not("status", "in", "(cancelled-with-notice,holiday)")
      .gte("scheduled_at", windowStartIso)
      .lte("scheduled_at", slotEndDate.toISOString()),
    admin
      .from("coach_blocks")
      .select("start_at, end_at")
      .eq("coach_id", coachId)
      .lt("start_at", slotEndDate.toISOString())
      .gt("end_at", slotStartDate.toISOString()),
    getHeldRecurringSlots(admin, coachId, new Date(windowStartIso), slotEndDate),
  ]);
  const overlaps = (start: Date, minutes: number) =>
    slotStartDate < new Date(start.getTime() + minutes * 60 * 1000) && slotEndDate > start;
  if (
    (nearbySessions ?? []).some((x) => overlaps(new Date(x.scheduled_at), x.duration_minutes)) ||
    (nearbyBlocks ?? []).length > 0 ||
    heldSlots.some((h) => overlaps(new Date(h.scheduledAt), h.durationMinutes))
  ) {
    return NextResponse.json({ error: "slot no longer available" }, { status: 409 });
  }

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

  // Self-service always confirms; an admin booking on someone's behalf can
  // untick "Notify student" (e.g. fixing a mistake) — lib/notifications/booking-events.ts.
  if (!isAdmin || notifyRequested !== false) void notifyStudentSessionBooked(session.id);

  notifyCoachSessionEvent(session.id, "session_booked").catch((err) =>
    console.error(`booking notification failed for session ${session.id}`, err),
  );

  return NextResponse.json({ success: true });
}

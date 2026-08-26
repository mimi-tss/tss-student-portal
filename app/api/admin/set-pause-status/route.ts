import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Admin-only pause/resume (spec section 3: "admin-only for now — not
// self-service"). Business rules on min/max duration etc. are enforced
// by staff process, not app logic, per spec — this just persists the
// toggle + dates. RLS ("admins can update all students", 0007) enforces
// the admin-only check.
export async function POST(req: NextRequest) {
  const { studentId, paused, pausedStart, pausedEnd } = await req.json();
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = await createClient();

  const update = paused
    ? { subscription_status: "paused", paused_start: pausedStart || null, paused_end: pausedEnd || null }
    : { subscription_status: "active", paused_start: null, paused_end: null };

  const { error } = await supabase.from("students").update(update).eq("id", studentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // materializeRecurringSessions runs well ahead of "now" (WEEKS_AHEAD),
  // so pausing a student who already has future sessions materialized
  // doesn't just stop NEW ones from being created (that filter already
  // existed) — it has to retroactively hold the ones that already exist.
  // 'paused' status (migration 0040) gets the coach calendar's usual
  // "held, grey, no attendance" treatment like a no-notice cancellation,
  // but is deliberately excluded from PAID_STATUSES so the coach isn't
  // paid for time the student can't attend. Any makeup credit spent
  // booking one of these is given back — the student didn't get to use
  // it, same reinstatement lib/booking/cancel-session.ts already does
  // for a within-notice cancellation.
  if (paused && pausedStart) {
    const rangeStart = `${pausedStart}T00:00:00.000Z`;
    const rangeEnd = pausedEnd ? `${pausedEnd}T23:59:59.999Z` : null;

    let query = supabase
      .from("sessions")
      .select("id, is_makeup, makeup_credit_id")
      .eq("student_id", studentId)
      .eq("status", "scheduled")
      .gte("scheduled_at", rangeStart);
    if (rangeEnd) query = query.lte("scheduled_at", rangeEnd);

    const { data: heldSessions } = await query;

    if (heldSessions && heldSessions.length > 0) {
      await supabase
        .from("sessions")
        .update({ status: "paused" })
        .in(
          "id",
          heldSessions.map((s) => s.id),
        );

      const creditIds = heldSessions
        .filter((s) => s.is_makeup && s.makeup_credit_id)
        .map((s) => s.makeup_credit_id as string);

      if (creditIds.length > 0) {
        await supabase
          .from("makeup_credits")
          .update({ used: false, used_session_id: null })
          .in("id", creditIds);
      }
    }
  }

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Admin-only: swaps which coach a single already-scheduled session
// belongs to (a one-off substitute) without touching the student's
// overall assigned_coach_id or their recurring schedule — those are
// changed separately (see recurring-schedule/route.ts and
// assign-coach/route.ts). Relies on the "admins can update all
// sessions" RLS policy (0017), same as the cancel routes.
export async function POST(req: NextRequest) {
  const { sessionId, coachId } = await req.json();

  if (!sessionId || !coachId) {
    return NextResponse.json({ error: "sessionId and coachId required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, scheduled_at, duration_minutes, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }
  if (session.status !== "scheduled") {
    return NextResponse.json({ error: "session is not scheduled" }, { status: 409 });
  }

  // The new coach must actually be free at that instant — reassigning
  // shouldn't silently double-book them.
  const { data: clash } = await supabase
    .from("sessions")
    .select("id")
    .eq("actual_coach_id", coachId)
    .eq("scheduled_at", session.scheduled_at)
    .neq("id", sessionId)
    .not("status", "in", "(cancelled-with-notice,cancelled-no-notice)")
    .maybeSingle();

  if (clash) {
    return NextResponse.json(
      { error: "that coach already has a session at this time" },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from("sessions")
    .update({ actual_coach_id: coachId })
    .eq("id", sessionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

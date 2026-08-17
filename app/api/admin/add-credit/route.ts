import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_DURATIONS = [30, 60];

// Admin-granted session credit for a student who bought an extra lesson
// via a standalone Stripe payment link — outside Kajabi entirely, no
// webhook, so this is the manual confirmation step after the admin sees
// the payment come through (spec section 5). Uncapped, expiry is
// whatever the admin sets, unlike self-service student-fault credits.
// Duration is picked explicitly (30 or 60 min) rather than assumed from
// the student's own plan — a 60-min add-on should book 60 min regardless
// of whether the student's regular sessions are 30.
export async function POST(req: NextRequest) {
  const { studentId, expiresAt, durationMinutes } = await req.json();

  if (!studentId || !expiresAt || !VALID_DURATIONS.includes(durationMinutes)) {
    return NextResponse.json(
      { error: "studentId, expiresAt, and durationMinutes (30 or 60) are required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.from("makeup_credits").insert({
    student_id: studentId,
    type: "purchased-addon",
    expires_at: expiresAt,
    duration_minutes: durationMinutes,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

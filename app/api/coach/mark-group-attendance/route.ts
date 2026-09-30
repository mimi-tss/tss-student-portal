import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateGroupAttendance } from "@/lib/group-attendance";
import { skipMissedEmail } from "@/lib/notifications/skip-missed-email";

// Per-attendee attendance marking for a group lesson — same posture as
// app/api/coach/mark-attendance: RLS ("coaches can mark attendance on
// their own group lesson registrations", migration 0031) scopes this to
// the coach's own group lessons, not re-checked here. "registered" lets
// a coach clear their own mismark (e.g. marked someone present by
// mistake) without needing admin to do it for them.
const ALLOWED_STATUSES = ["registered", "attended", "no-show"] as const;

export async function POST(req: NextRequest) {
  // sendMissedEmail: false = coach unticked the email in the no-show popup.
  const { registrationId, status, sendMissedEmail } = await req.json();

  if (!registrationId || !ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  // Also starts/clears the missed-session email's 2-hour grace clock.
  const { data, error } = await updateGroupAttendance(supabase, registrationId, status);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "registration not found" }, { status: 404 });
  }
  if (status === "no-show" && sendMissedEmail === false && data.student_id) {
    await skipMissedEmail(data.student_id, { registrationId });
  }

  return NextResponse.json({ success: true });
}

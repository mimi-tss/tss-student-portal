import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { materializeRecurringSessions } from "@/lib/scheduling/recurring";

// Corrects students.billing_anniversary_date — the anchor
// occurrencesFor() (lib/scheduling/recurring.ts) uses to decide which
// weekly occurrence is the cycle's "5th Wednesday" (skipped, not billed
// or booked — CYCLE_SESSION_CAP). A wrong anchor currently shows as a
// real session that should've been a skip week, or vice versa. RLS
// ("admins can update all students", 0007) enforces the admin-only
// check, same posture as set-birth-date/set-referral.
export async function POST(req: NextRequest) {
  const { studentId, billingAnniversaryDate } = await req.json();

  if (!studentId || !billingAnniversaryDate) {
    return NextResponse.json(
      { error: "studentId and billingAnniversaryDate are required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const { error: updateError } = await supabase
    .from("students")
    .update({ billing_anniversary_date: billingAnniversaryDate })
    .eq("id", studentId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Re-evaluate this student's recurring slot under the corrected
  // anchor immediately, rather than leaving stale occurrences sitting
  // there until the daily cron happens to paper over some of them —
  // materializeRecurringSessions only ever fills in occurrences missing
  // from the CURRENT anchor's pattern, it never removes ones that no
  // longer belong. Same delete-then-regenerate approach
  // recurring-schedule's own POST route uses when the day/time changes.
  const { data: schedule } = await supabase
    .from("recurring_schedules")
    .select("id")
    .eq("student_id", studentId)
    .maybeSingle();

  if (schedule) {
    const { error: deleteError } = await supabase
      .from("sessions")
      .delete()
      .eq("recurring_schedule_id", schedule.id)
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString());

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
  }

  const result = await materializeRecurringSessions(supabase, { studentId });

  return NextResponse.json({ success: true, ...result });
}

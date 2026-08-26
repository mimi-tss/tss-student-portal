import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { currentBillingCycleRange } from "@/lib/scheduling/recurring";
import { createAttentionItem } from "@/lib/admin/attention-items";

// Admin-initiated version of app/api/student/requests/route.ts — same
// shape (one pending request at a time, effective_date = end of the
// current billing cycle), just triggered by admin instead of the
// student. Deliberately NOT auto-approved: this only flags the intent
// so it lands in Needs Review — admin often tries to retain the student
// first, so nothing about the recurring schedule or billing changes yet.
// If it's still unresolved by the next billing cycle,
// materializeRecurringSessions stops generating further sessions for
// this student on its own (lib/scheduling/recurring.ts).
export async function POST(req: NextRequest) {
  const { studentId, reason } = await req.json();

  if (!studentId || !reason?.trim()) {
    return NextResponse.json({ error: "studentId and reason required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("id, name, billing_anniversary_date")
    .eq("id", studentId)
    .maybeSingle();
  if (!student) return NextResponse.json({ error: "student not found" }, { status: 404 });

  const { data: existing } = await supabase
    .from("student_requests")
    .select("id")
    .eq("student_id", student.id)
    .eq("type", "cancel_subscription")
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "A cancellation is already flagged for this student." }, { status: 409 });
  }

  const { end: cycleEnd } = currentBillingCycleRange(student.billing_anniversary_date);
  const effectiveDate = cycleEnd.toISOString().slice(0, 10);

  const { data: inserted, error } = await supabase
    .from("student_requests")
    .insert({
      student_id: student.id,
      type: "cancel_subscription",
      reason: reason.trim(),
      effective_date: effectiveDate,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await createAttentionItem(supabase, {
    kind: "cancel_request",
    studentId: student.id,
    requestId: inserted.id,
    summary: `${student.name} — flagged by admin: ${reason.trim()} · effective end of cycle ${effectiveDate}`,
  });

  return NextResponse.json({ success: true, effectiveDate });
}

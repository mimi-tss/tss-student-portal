import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { currentBillingCycleRange } from "@/lib/scheduling/recurring";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAttentionItem } from "@/lib/admin/attention-items";

// Student-submitted cancellation requests — land in the admin Overview's
// "Needs Attention" queue for review (see app/api/admin/requests/route.ts).
// RLS ("students can create their own requests", migration 0034) scopes
// the insert to the caller's own student_id. Pause is deliberately not
// here — it stays admin-only, registered by the studio after a student
// contacts them directly, not self-service.
export async function POST(req: NextRequest) {
  const { reason } = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: student } = await supabase
    .from("students")
    .select("id, billing_anniversary_date")
    .eq("profile_id", user.id)
    .single();
  if (!student) return NextResponse.json({ error: "no student record" }, { status: 404 });

  // One pending request at a time — a second submission while the first
  // is still pending would just clutter the admin queue.
  const { data: existing } = await supabase
    .from("student_requests")
    .select("id")
    .eq("student_id", student.id)
    .eq("type", "cancel_subscription")
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "You already have a pending request." }, { status: 409 });
  }

  const { end: cycleEnd } = currentBillingCycleRange(student.billing_anniversary_date);
  const effectiveDate = cycleEnd.toISOString().slice(0, 10);

  const { data: inserted, error } = await supabase
    .from("student_requests")
    .insert({
      student_id: student.id,
      type: "cancel_subscription",
      reason: reason || null,
      effective_date: effectiveDate,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // attention_items is admin-only by RLS — this student-facing route uses
  // the service-role client just for this one insert, same posture as
  // other privileged-but-scoped writes elsewhere (e.g. the login streak).
  const { data: studentRow } = await supabase.from("students").select("name").eq("id", student.id).single();
  const admin = createAdminClient();
  await createAttentionItem(admin, {
    kind: "cancel_request",
    studentId: student.id,
    requestId: inserted.id,
    summary: `${studentRow?.name ?? "Student"} submitted via form · effective end of cycle ${effectiveDate}`,
  });

  return NextResponse.json({ success: true });
}

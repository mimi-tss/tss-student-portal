import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { createAttentionItem } from "@/lib/admin/attention-items";
import { notifyStaff } from "@/lib/notifications/create";

// Replaces the old direct-Stripe app/api/billing/cancel — clicking
// Cancel no longer touches Stripe at all. It only creates a request that
// alerts admin with a salvage window: admin can pause the subscription
// while attempting to win the student back (app/api/admin/
// salvage-pause-subscription), then either resume it ("Mark retained")
// or actually schedule the cancellation ("Mark cancelled") from the
// existing Stop panel — both of those already call
// /api/admin/attention-items/resolve, now Stripe-aware (see
// lib/admin/attention-items.ts).
export async function POST(req: NextRequest) {
  const { reason } = await req.json();

  if (typeof reason !== "string" || !reason.trim()) {
    return NextResponse.json({ error: "A reason is required." }, { status: 400 });
  }

  const billingStudent = await resolveBillingStudent();
  if (!billingStudent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("student_requests")
    .select("id")
    .eq("student_id", billingStudent.studentId)
    .eq("type", "cancel_subscription")
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "You already have a pending cancellation request." }, { status: 409 });
  }

  const { data: inserted, error } = await supabase
    .from("student_requests")
    .insert({
      student_id: billingStudent.studentId,
      type: "cancel_subscription",
      reason: reason.trim(),
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? "Couldn't submit request." }, { status: 500 });
  }

  const admin = createAdminClient();
  await createAttentionItem(admin, {
    kind: "cancel_request",
    studentId: billingStudent.studentId,
    requestId: inserted.id,
    summary: `${billingStudent.name} requested to cancel · reason: ${reason.trim()}`,
  });
  await notifyStaff(admin, {
    kind: "cancel_request",
    dedupKey: inserted.id,
    text: `⚠️ ${billingStudent.name} requested to cancel their subscription — reason: "${reason.trim()}". See Needs Review — try to salvage before it's final.`,
  });

  return NextResponse.json({ success: true });
}

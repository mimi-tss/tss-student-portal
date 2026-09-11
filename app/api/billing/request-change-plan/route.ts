import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { createAttentionItem } from "@/lib/admin/attention-items";
import { notifyStaff } from "@/lib/notifications/create";
import { TIER_LABEL, BILLING_INTERVALS, INTERVAL_LABEL, type BillingInterval } from "@/lib/stripe/tiers";
import type { Tier } from "@/types/database";

const VALID_TIERS: Tier[] = ["lite", "suite", "pro", "elite"];

// Same request-gated shape as pause/cancel — replaces sending students
// to Stripe's hosted Billing Portal for a plan switch. Admin approving
// the request is what actually swaps the subscription's price in Stripe
// (see lib/admin/attention-items.ts's resolveAttentionItem).
export async function POST(req: NextRequest) {
  const { tier, interval = "monthly", reason } = await req.json();

  if (typeof tier !== "string" || !VALID_TIERS.includes(tier as Tier)) {
    return NextResponse.json({ error: "A valid tier is required" }, { status: 400 });
  }
  if (!BILLING_INTERVALS.includes(interval)) {
    return NextResponse.json({ error: "A valid interval is required" }, { status: 400 });
  }
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
    .eq("type", "change_plan")
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "You already have a pending plan change request." }, { status: 409 });
  }

  const { data: inserted, error } = await supabase
    .from("student_requests")
    .insert({
      student_id: billingStudent.studentId,
      type: "change_plan",
      reason: reason.trim(),
      requested_tier: tier,
      requested_interval: interval,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? "Couldn't submit request." }, { status: 500 });
  }

  const admin = createAdminClient();
  await createAttentionItem(admin, {
    kind: "change_plan_request",
    studentId: billingStudent.studentId,
    requestId: inserted.id,
    summary: `${billingStudent.name} requested to switch to ${TIER_LABEL[tier as Tier]} (${INTERVAL_LABEL[interval as BillingInterval]}) · reason: ${reason.trim()}`,
  });
  await notifyStaff(admin, {
    kind: "change_plan_request",
    dedupKey: inserted.id,
    text: `${billingStudent.name} requested to switch to ${TIER_LABEL[tier as Tier]} (${INTERVAL_LABEL[interval as BillingInterval]}). See Needs Review.`,
  });

  return NextResponse.json({ success: true });
}

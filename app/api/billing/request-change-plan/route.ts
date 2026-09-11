import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { notifyStaff } from "@/lib/notifications/create";
import { getStripeClient } from "@/lib/stripe/client";
import { STRIPE_PRICE_BY_TIER, TIER_LABEL, INTERVAL_LABEL, type BillingInterval } from "@/lib/stripe/tiers";
import type { Tier } from "@/types/database";

// Elite is application-only (see lib/billing/tier-copy.ts) — no self-serve
// switch, the UI never offers it here, and this rejects a direct POST too.
const VALID_TIERS: Tier[] = ["lite", "suite", "pro"];

// Existing students changing plans only ever choose Monthly or Yearly —
// the 3-month/6-month intervals stay promotional-checkout-only (new
// signups, app/api/billing/checkout). The UI never sends anything else;
// this rejects a direct POST too.
const VALID_INTERVALS: BillingInterval[] = ["monthly", "yearly"];

// Self-serve, instant: student picks a tier and it swaps right away —
// no admin approval gate (unlike pause/cancel, which stay request-gated
// for the salvage workflow). Still logs a student_requests row (already
// "approved") for the record, and pings staff in Slack so they know it
// happened — informational only, nothing for them to action.
export async function POST(req: NextRequest) {
  const { tier, interval = "monthly", reason } = await req.json();

  if (typeof tier !== "string" || !VALID_TIERS.includes(tier as Tier)) {
    return NextResponse.json({ error: "A valid tier is required" }, { status: 400 });
  }
  if (!VALID_INTERVALS.includes(interval)) {
    return NextResponse.json({ error: "A valid interval is required" }, { status: 400 });
  }

  const billingStudent = await resolveBillingStudent();
  if (!billingStudent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!billingStudent.stripeCustomerId || !billingStudent.stripeSubscriptionId || !billingStudent.stripeAccount) {
    return NextResponse.json({ error: "No billing account linked." }, { status: 400 });
  }

  // Falls back to monthly when this tier has no yearly price configured
  // — mirrors the picker's own fallback (app/billing/tier-card.tsx) so a
  // tier without a yearly option is never a hard error here.
  const effectiveInterval: BillingInterval = STRIPE_PRICE_BY_TIER[tier as Tier][interval as BillingInterval]
    ? (interval as BillingInterval)
    : "monthly";
  const newPriceId = STRIPE_PRICE_BY_TIER[tier as Tier][effectiveInterval];
  if (!newPriceId) {
    return NextResponse.json({ error: `${TIER_LABEL[tier as Tier]} isn't available right now.` }, { status: 400 });
  }

  const client = getStripeClient(billingStudent.stripeAccount);
  const subscription = await client.subscriptions.retrieve(billingStudent.stripeSubscriptionId);
  const currentItemId = subscription.items.data[0]?.id;
  if (!currentItemId) {
    return NextResponse.json({ error: "Subscription has no items to update." }, { status: 500 });
  }

  await client.subscriptions.update(billingStudent.stripeSubscriptionId, {
    items: [{ id: currentItemId, price: newPriceId }],
  });

  const supabase = await createClient();
  const { data: inserted } = await supabase
    .from("student_requests")
    .insert({
      student_id: billingStudent.studentId,
      type: "change_plan",
      status: "approved",
      reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
      requested_tier: tier,
      requested_interval: effectiveInterval,
      resolved_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  const admin = createAdminClient();
  await notifyStaff(admin, {
    kind: "change_plan_request",
    dedupKey: inserted?.id ?? `${billingStudent.studentId}-${Date.now()}`,
    text: `${billingStudent.name} switched to ${TIER_LABEL[tier as Tier]} (${INTERVAL_LABEL[effectiveInterval]}).`,
  });

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { notifyStaff } from "@/lib/notifications/create";
import { getStripeClient } from "@/lib/stripe/client";
import { STRIPE_PRICE_BY_TIER, TIER_LABEL, INTERVAL_LABEL, type BillingInterval } from "@/lib/stripe/tiers";
import { resolveAddonFromPrice } from "@/lib/billing/addons";
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
  const subscription = await client.subscriptions.retrieve(billingStudent.stripeSubscriptionId, {
    expand: ["items.data.price"],
  });
  const currentItemId = subscription.items.data[0]?.id;
  if (!currentItemId) {
    return NextResponse.json({ error: "Subscription has no items to update." }, { status: 500 });
  }

  await client.subscriptions.update(billingStudent.stripeSubscriptionId, {
    items: [{ id: currentItemId, price: newPriceId }],
  });

  // Drop any add-on subscription item that isn't offered on the new tier
  // (e.g. Suite's biweekly-lessons add-on doesn't carry over to Pro) —
  // per-student instant self-serve, so this has to happen right here
  // rather than relying on an admin to notice and clean it up. Matched by
  // Price metadata (resolveAddonFromPrice), not a fixed ID, so this also
  // catches a legacy (Opus-account) student's pre-existing add-on item.
  // An item that doesn't resolve to any known add-on at all is left
  // alone — never delete something this app doesn't recognize.
  const addonItems = subscription.items.data.slice(1);
  await Promise.all(
    addonItems
      .filter((item) => {
        const addon = resolveAddonFromPrice(item.price);
        return addon && addon.tier !== (tier as Tier);
      })
      .map((item) => client.subscriptionItems.del(item.id)),
  );

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

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { notifyStaff } from "@/lib/notifications/create";
import { findAddon, resolveAddonPriceId, resolveAddonFromPrice } from "@/lib/billing/addons";
import { resolvePromotionCode } from "@/lib/stripe/coupons";
import { getStripeClient } from "@/lib/stripe/client";
import { resolveTierFromPrice } from "@/lib/stripe/tiers";

const VALID_ACTIONS = ["add", "remove"] as const;
type AddonAction = (typeof VALID_ACTIONS)[number];

// Self-serve, instant, same posture as Change Plan (0103): a student
// toggles an add-on and it applies right away on their real subscription
// — no admin approval. Still logs a student_requests row (already
// "approved") for the record and pings staff in Slack, informational only.
//
// "Remove" matches the existing item by Price metadata (addon_id), so it
// works for a legacy (Opus-account) student's pre-existing add-on item
// just as well as a new "own"-account one — see
// lib/billing/addons.ts's resolveAddonFromPrice. "Add" always creates
// against the current "own"-account Price, so it's own-account-only —
// Opus isn't meant to gain new priced items.
export async function POST(req: NextRequest) {
  const { addonId, action, couponCode } = await req.json();

  if (typeof addonId !== "string" || !addonId) {
    return NextResponse.json({ error: "An add-on is required" }, { status: 400 });
  }
  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: "A valid action is required" }, { status: 400 });
  }

  const addon = findAddon(addonId);
  if (!addon) return NextResponse.json({ error: "Unknown add-on" }, { status: 400 });
  if (addon.kind !== "recurring") {
    return NextResponse.json({ error: "This add-on is a one-time purchase — see /api/billing/addons/purchase." }, { status: 400 });
  }

  const billingStudent = await resolveBillingStudent();
  if (!billingStudent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!billingStudent.stripeCustomerId || !billingStudent.stripeSubscriptionId || !billingStudent.stripeAccount) {
    return NextResponse.json({ error: "No billing account linked." }, { status: 400 });
  }

  const client = getStripeClient(billingStudent.stripeAccount);
  const subscription = await client.subscriptions.retrieve(billingStudent.stripeSubscriptionId, {
    expand: ["items.data.price"],
  });

  const tier = resolveTierFromPrice(subscription.items.data[0]?.price);
  if (!tier || !addon.tiers.includes(tier)) {
    return NextResponse.json({ error: `${addon.label} isn't available on your current plan.` }, { status: 400 });
  }

  const existingItem = subscription.items.data
    .slice(1)
    .find((item) => resolveAddonFromPrice(item.price)?.id === addon.id);

  const addonAction = action as AddonAction;

  if (addonAction === "add") {
    if (existingItem) return NextResponse.json({ error: `${addon.label} is already active.` }, { status: 400 });
    if (billingStudent.stripeAccount !== "own") {
      return NextResponse.json(
        { error: `${addon.label} can be added once your billing has moved to our current system — ask the studio.` },
        { status: 400 },
      );
    }
    const priceId = resolveAddonPriceId(addon);
    if (!priceId) return NextResponse.json({ error: `${addon.label} isn't available right now.` }, { status: 400 });

    // Unlike a one-time purchase (which has to compute the discounted
    // amount itself, see .../purchase/route.ts), a recurring add-on just
    // hands Stripe the promotion code directly — it applies its own
    // percent/amount-off math to every future invoice, for however long
    // the underlying Coupon's own duration says to. An unknown/expired/
    // inactive code is silently ignored (full price), same as purchase.
    const resolvedCoupon = typeof couponCode === "string" && couponCode.trim() ? await resolvePromotionCode(couponCode) : null;

    await client.subscriptionItems.create({
      subscription: billingStudent.stripeSubscriptionId,
      price: priceId,
      ...(resolvedCoupon ? { discounts: [{ promotion_code: resolvedCoupon.promotionCode.id }] } : {}),
    });
  } else {
    if (!existingItem) return NextResponse.json({ error: `${addon.label} isn't active.` }, { status: 400 });
    await client.subscriptionItems.del(existingItem.id);
  }

  const supabase = await createClient();
  const { data: inserted } = await supabase
    .from("student_requests")
    .insert({
      student_id: billingStudent.studentId,
      type: "addon_toggle",
      status: "approved",
      addon_id: addon.id,
      addon_action: addonAction,
      resolved_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  const admin = createAdminClient();
  await notifyStaff(admin, {
    kind: "addon_toggle",
    dedupKey: inserted?.id ?? `${billingStudent.studentId}-${Date.now()}`,
    text: `${billingStudent.name} ${addonAction === "add" ? "added" : "removed"} ${addon.label}.`,
  });

  return NextResponse.json({ success: true });
}

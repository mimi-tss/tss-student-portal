import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { notifyStaff } from "@/lib/notifications/create";
import { stripe, stripeOpus } from "@/lib/stripe/client";
import { STRIPE_PRICE_BY_TIER, TIER_LABEL, INTERVAL_LABEL, type BillingInterval } from "@/lib/stripe/tiers";
import type { Tier } from "@/types/database";

const VALID_TIERS: Tier[] = ["lite", "suite", "pro"];
const VALID_INTERVALS: BillingInterval[] = ["monthly", "yearly"];

// Step 2 of the Opus→own migration — runs once the student has confirmed
// a new card via .../migrate/setup-intent. Creates a real new
// subscription on the CURRENT account, `trial_end`-anchored to the
// student's existing Opus period end so they're never charged twice for
// the same stretch of time, and schedules the old Opus subscription to
// end at that same instant. Everything here either fully lands or the
// student stays on Opus — no student ever ends up linked to a new
// subscription that doesn't actually exist.
export async function POST(req: NextRequest) {
  const { tier, interval = "monthly", reason, ownCustomerId, setupIntentId } = await req.json();

  if (typeof tier !== "string" || !VALID_TIERS.includes(tier as Tier)) {
    return NextResponse.json({ error: "A valid tier is required" }, { status: 400 });
  }
  if (!VALID_INTERVALS.includes(interval)) {
    return NextResponse.json({ error: "A valid interval is required" }, { status: 400 });
  }
  if (typeof ownCustomerId !== "string" || typeof setupIntentId !== "string") {
    return NextResponse.json({ error: "Missing card setup." }, { status: 400 });
  }

  const billingStudent = await resolveBillingStudent();
  if (!billingStudent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (billingStudent.stripeAccount !== "opus" || !billingStudent.stripeSubscriptionId) {
    return NextResponse.json({ error: "This account doesn't need a migration." }, { status: 400 });
  }

  const newPriceId = STRIPE_PRICE_BY_TIER[tier as Tier][interval as BillingInterval];
  if (!newPriceId) {
    return NextResponse.json({ error: `${TIER_LABEL[tier as Tier]} isn't available on that billing interval.` }, { status: 400 });
  }

  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
  if (setupIntent.status !== "succeeded" || !setupIntent.payment_method) {
    return NextResponse.json({ error: "Card setup wasn't completed — try again." }, { status: 400 });
  }
  const paymentMethodId =
    typeof setupIntent.payment_method === "string" ? setupIntent.payment_method : setupIntent.payment_method.id;
  if (setupIntent.customer !== ownCustomerId) {
    return NextResponse.json({ error: "Card setup didn't match this account — try again." }, { status: 400 });
  }

  await stripe.customers.update(ownCustomerId, { invoice_settings: { default_payment_method: paymentMethodId } });

  // The Opus subscription's own current period end anchors the new
  // subscription's trial — the student pays nothing new until the exact
  // moment their existing Opus period would have ended anyway.
  const opusSubscription = await stripeOpus.subscriptions.retrieve(billingStudent.stripeSubscriptionId);
  const periodEnd = opusSubscription.items.data[0]?.current_period_end;
  if (!periodEnd) {
    return NextResponse.json({ error: "Couldn't read the current billing period — try again." }, { status: 500 });
  }

  const newSubscription = await stripe.subscriptions.create({
    customer: ownCustomerId,
    items: [{ price: newPriceId }],
    trial_end: periodEnd,
    default_payment_method: paymentMethodId,
    metadata: { tier, migratedFromOpus: "true" },
  });

  // Ends at the same instant the new subscription's trial does — never
  // both charging. Not cancel_at_period_end: this account is being
  // retired for this student, not just this one subscription cycle.
  await stripeOpus.subscriptions.update(billingStudent.stripeSubscriptionId, { cancel_at: periodEnd });

  // Written before the webhook for the new subscription's own
  // customer.subscription.created event can arrive — that handler looks
  // the student up by (stripe_customer_id, stripe_account), so this
  // write has to land first (or the sync just quietly no-ops this once
  // and corrects on the next event, same benign-lag posture already
  // documented in app/api/webhooks/stripe/route.ts).
  const admin = createAdminClient();
  await admin
    .from("students")
    .update({
      stripe_customer_id: ownCustomerId,
      stripe_subscription_id: newSubscription.id,
      stripe_account: "own",
    })
    .eq("id", billingStudent.studentId);

  const supabase = await createClient();
  const { data: inserted } = await supabase
    .from("student_requests")
    .insert({
      student_id: billingStudent.studentId,
      type: "change_plan",
      status: "approved",
      reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
      requested_tier: tier,
      requested_interval: interval,
      resolved_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  await notifyStaff(admin, {
    kind: "opus_migration",
    dedupKey: inserted?.id ?? newSubscription.id,
    text: `${billingStudent.name} moved off legacy Opus billing onto ${TIER_LABEL[tier as Tier]} (${INTERVAL_LABEL[interval as BillingInterval]}) — current billing starts ${new Date(periodEnd * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`,
  });

  return NextResponse.json({ success: true });
}

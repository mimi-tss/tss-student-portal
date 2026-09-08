import { NextResponse } from "next/server";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { getStripeClient } from "@/lib/stripe/client";
import { deriveDisplayStatus } from "@/lib/stripe/status";

// Live subscription detail for the account page — amount, next charge
// date, payment method, status. Deliberately not read from our local
// `students` mirror: that only ever stored tier/subscription_status/
// payment_status, never amount/card/next-charge, and the display status
// here is finer-grained (4 states, see lib/stripe/status.ts) than the
// 3-state DB enum. Also performs the lazy link-on-first-view (see
// resolveBillingStudent) — this is the first route a logged-in student
// hits after landing on /billing/account.
export async function GET() {
  const billingStudent = await resolveBillingStudent();
  if (!billingStudent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!billingStudent.stripeCustomerId || !billingStudent.stripeSubscriptionId || !billingStudent.stripeAccount) {
    return NextResponse.json({ linked: false });
  }

  const client = getStripeClient(billingStudent.stripeAccount);
  const subscription = await client.subscriptions.retrieve(billingStudent.stripeSubscriptionId, {
    expand: ["default_payment_method", "items.data.price", "customer"],
  });

  const item = subscription.items.data[0];
  const price = item?.price;

  let card: { brand: string; last4: string } | null = null;
  const pm = subscription.default_payment_method;
  if (pm && typeof pm !== "string" && pm.card) {
    card = { brand: pm.card.brand, last4: pm.card.last4 };
  } else {
    // No subscription-level default — fall back to the customer's own
    // default payment method.
    const customer = subscription.customer;
    if (customer && typeof customer !== "string" && !customer.deleted) {
      const customerPm = customer.invoice_settings?.default_payment_method;
      if (customerPm && typeof customerPm !== "string" && customerPm.card) {
        card = { brand: customerPm.card.brand, last4: customerPm.card.last4 };
      }
    }
  }

  return NextResponse.json({
    linked: true,
    status: deriveDisplayStatus(subscription),
    amount: price?.unit_amount ?? null,
    currency: price?.currency ?? null,
    interval: price?.recurring?.interval ?? null,
    nextChargeAt: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    pauseResumesAt: subscription.pause_collection?.resumes_at
      ? new Date(subscription.pause_collection.resumes_at * 1000).toISOString()
      : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    card,
  });
}

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { getStripeClient } from "@/lib/stripe/client";
import { deriveDisplayStatus } from "@/lib/stripe/status";
import { resolveTierFromPrice } from "@/lib/stripe/tiers";

interface CardInfo {
  brand: string;
  last4: string;
}

// A payment method might not be a card at all (Link, since checkout/
// update-card both allow it now) — brand/last4 genuinely don't exist on
// those, so this returns null rather than a broken/empty card. `pm` is
// only ever a string here if the field it came from wasn't expanded.
function extractCard(pm: Stripe.PaymentMethod | string | null | undefined): CardInfo | null {
  if (!pm || typeof pm === "string" || !pm.card) return null;
  return { brand: pm.card.brand, last4: pm.card.last4 };
}

// Live subscription detail for the account page — amount, next charge
// date, payment method, status. Deliberately not read from our local
// `students` mirror: that only ever stored tier/subscription_status/
// payment_status, never amount/card/next-charge, and the display status
// here is finer-grained (4 states, see lib/stripe/status.ts) than the
// 3-state DB enum. Also performs the lazy link-on-first-view (see
// resolveBillingStudent) — this is the first route a logged-in student
// hits after landing on /billing/account.
export async function GET() {
  // Wrapped in try/catch specifically so a Stripe-side failure (e.g. a
  // misconfigured account key during setup) surfaces its real message
  // instead of an opaque 500 the client can't distinguish from a normal
  // "not linked" response — confirmed live this distinction was missing
  // and made a real setup bug look identical to an expected empty state.
  try {
    const billingStudent = await resolveBillingStudent();
    if (!billingStudent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    if (!billingStudent.stripeCustomerId || !billingStudent.stripeSubscriptionId || !billingStudent.stripeAccount) {
      return NextResponse.json({ linked: false });
    }

    const client = getStripeClient(billingStudent.stripeAccount);
    const subscription = await client.subscriptions.retrieve(billingStudent.stripeSubscriptionId, {
      // Expanding "customer" alone only gets the customer OBJECT — its
      // own default_payment_method field stays an un-expanded string ID
      // unless separately listed here too (confirmed: this was the real
      // bug behind the fallback path silently never finding a card).
      expand: [
        "default_payment_method",
        "items.data.price.product",
        "customer",
        "customer.invoice_settings.default_payment_method",
      ],
    });

    const item = subscription.items.data[0];
    const price = item?.price;
    // The real Stripe Product name ("Sing Smarter Pro") — deliberately
    // not our internal Tier label ("Pro"), since the student should see
    // the same name the studio uses everywhere else.
    const product = price?.product;
    const planName = product && typeof product !== "string" && !product.deleted ? product.name : null;

    let card = extractCard(subscription.default_payment_method);
    let paymentMethodType: string | null = card
      ? "card"
      : typeof subscription.default_payment_method !== "string" && subscription.default_payment_method
        ? subscription.default_payment_method.type
        : null;

    if (!card) {
      // No subscription-level default (or it's non-card, e.g. Link) —
      // fall back to the customer's own default payment method.
      const customer = subscription.customer;
      if (customer && typeof customer !== "string" && !customer.deleted) {
        const customerPm = customer.invoice_settings?.default_payment_method;
        card = extractCard(customerPm);
        if (!paymentMethodType && customerPm && typeof customerPm !== "string") {
          paymentMethodType = customerPm.type;
        }
      }
    }

    return NextResponse.json({
      linked: true,
      studentName: billingStudent.name,
      planName,
      tier: resolveTierFromPrice(price),
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
      // Lets the UI show "Link" (or whatever else) instead of a blank
      // dash when there's a real saved payment method that just isn't a
      // card — rather than looking like nothing is on file at all.
      paymentMethodType,
    });
  } catch (err) {
    console.error("GET /api/billing/subscription failed", err);
    const message = err instanceof Error ? err.message : "Something went wrong loading your subscription.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

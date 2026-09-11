import { NextResponse } from "next/server";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { getStripeClient } from "@/lib/stripe/client";

// Publishable keys are per-account too (unlike the secret keys, safe to
// ship to the client — that's what "publishable" means), so the client
// needs to know which one to load Stripe.js with alongside the
// SetupIntent's client_secret.
const PUBLISHABLE_KEY_BY_ACCOUNT = {
  own: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  opus: process.env.NEXT_PUBLIC_OPUS_STRIPE_PUBLISHABLE_KEY,
} as const;

export async function POST() {
  const billingStudent = await resolveBillingStudent();
  if (!billingStudent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!billingStudent.stripeCustomerId || !billingStudent.stripeAccount) {
    return NextResponse.json({ error: "No billing account found for this student." }, { status: 404 });
  }

  const client = getStripeClient(billingStudent.stripeAccount);
  // Card + Link only — without an explicit list, Payment Element shows
  // every payment method enabled on the Stripe account's own Settings
  // page (confirmed live: Amazon Pay, Bancontact — a Belgium-only
  // method — and Cash App Pay all showed up unprompted). Link is
  // included alongside card since both work in any currency/country
  // (relevant given this studio's real international student spread —
  // mostly US with a handful scattered globally, not concentrated
  // enough in the Eurozone to justify SEPA, which also wouldn't work
  // anyway against USD-priced subscriptions).
  const setupIntent = await client.setupIntents.create({
    customer: billingStudent.stripeCustomerId,
    payment_method_types: ["card", "link"],
  });

  return NextResponse.json({
    clientSecret: setupIntent.client_secret,
    publishableKey: PUBLISHABLE_KEY_BY_ACCOUNT[billingStudent.stripeAccount],
    // Pre-fills the Payment Element's email field so Link can recognize
    // a known email immediately instead of showing its full "save my
    // info for faster checkout" signup prompt (name/phone/email) —
    // Stripe's own documented way to keep Link's inline UI compact.
    email: billingStudent.email,
  });
}

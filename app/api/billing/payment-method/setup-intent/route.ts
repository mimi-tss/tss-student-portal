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
  const setupIntent = await client.setupIntents.create({ customer: billingStudent.stripeCustomerId });

  return NextResponse.json({
    clientSecret: setupIntent.client_secret,
    publishableKey: PUBLISHABLE_KEY_BY_ACCOUNT[billingStudent.stripeAccount],
  });
}

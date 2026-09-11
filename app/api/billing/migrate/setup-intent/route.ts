import { NextResponse } from "next/server";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { stripe } from "@/lib/stripe/client";
import { findOrCreateOwnCustomer } from "@/lib/stripe/accounts";

// Step 1 of the Opus→own migration (see .../migrate/complete/route.ts for
// step 2). An Opus-linked student changing plans needs a card on the
// CURRENT account before anything else — Opus's saved card can't be
// reused, it belongs to a different Stripe account entirely. This always
// creates/reuses an "own"-account Customer (never Opus) and a SetupIntent
// against it, mirroring app/api/billing/payment-method/setup-intent's own
// Card+Link-only shape, just against a customer that may not exist yet.
export async function POST() {
  const billingStudent = await resolveBillingStudent();
  if (!billingStudent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (billingStudent.stripeAccount !== "opus") {
    return NextResponse.json({ error: "This account doesn't need a migration." }, { status: 400 });
  }

  const ownCustomerId = await findOrCreateOwnCustomer(billingStudent.email, billingStudent.name);

  const setupIntent = await stripe.setupIntents.create({
    customer: ownCustomerId,
    payment_method_types: ["card", "link"],
  });

  return NextResponse.json({
    clientSecret: setupIntent.client_secret,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    ownCustomerId,
  });
}

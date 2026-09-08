import { NextRequest, NextResponse } from "next/server";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { getStripeClient } from "@/lib/stripe/client";

// The client confirms the SetupIntent itself (stripe.confirmSetup, via
// Payment Element) and only calls this once that succeeds — this route's
// job is just to make the resulting payment method the default one, on
// both the customer and the active subscription, so future invoices
// actually charge the new card.
export async function POST(req: NextRequest) {
  const { setupIntentId } = await req.json();
  if (typeof setupIntentId !== "string") {
    return NextResponse.json({ error: "setupIntentId required" }, { status: 400 });
  }

  const billingStudent = await resolveBillingStudent();
  if (!billingStudent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!billingStudent.stripeCustomerId || !billingStudent.stripeAccount) {
    return NextResponse.json({ error: "No billing account found for this student." }, { status: 404 });
  }

  const client = getStripeClient(billingStudent.stripeAccount);
  const setupIntent = await client.setupIntents.retrieve(setupIntentId);

  if (setupIntent.customer !== billingStudent.stripeCustomerId) {
    return NextResponse.json({ error: "This setup intent doesn't belong to your account." }, { status: 403 });
  }
  if (setupIntent.status !== "succeeded" || !setupIntent.payment_method) {
    return NextResponse.json({ error: "Card setup hasn't completed yet." }, { status: 409 });
  }

  const paymentMethodId =
    typeof setupIntent.payment_method === "string" ? setupIntent.payment_method : setupIntent.payment_method.id;

  await client.customers.update(billingStudent.stripeCustomerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  if (billingStudent.stripeSubscriptionId) {
    await client.subscriptions.update(billingStudent.stripeSubscriptionId, {
      default_payment_method: paymentMethodId,
    });
  }

  return NextResponse.json({ success: true });
}

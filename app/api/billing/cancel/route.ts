import { NextResponse } from "next/server";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { getStripeClient } from "@/lib/stripe/client";

// End-of-period cancellation (cancel_at_period_end: true), matching this
// app's existing convention everywhere else a subscription can be
// cancelled (the Kajabi flow, the self-service student_requests flow) —
// the student keeps access through what they already paid for. The
// resulting customer.subscription.updated webhook is what actually
// surfaces this to admin (Needs Review + Slack) — this route only ever
// tells Stripe to schedule it.
export async function POST() {
  const billingStudent = await resolveBillingStudent();
  if (!billingStudent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!billingStudent.stripeSubscriptionId || !billingStudent.stripeAccount) {
    return NextResponse.json({ error: "No billing account found for this student." }, { status: 404 });
  }

  const client = getStripeClient(billingStudent.stripeAccount);
  await client.subscriptions.update(billingStudent.stripeSubscriptionId, { cancel_at_period_end: true });

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { getStripeClient } from "@/lib/stripe/client";

// Pauses collection until a chosen date. Stripe's own `resumes_at` is a
// real, respected field (confirmed against the installed SDK's types) —
// it auto-clears the pause and resumes billing at that timestamp on its
// own, no cron needed on our side. The resulting customer.subscription.
// updated webhook keeps our local mirror in sync either way.
export async function POST(req: NextRequest) {
  const { resumeDate } = await req.json();
  if (typeof resumeDate !== "string") {
    return NextResponse.json({ error: "resumeDate required" }, { status: 400 });
  }

  const resumesAtMs = Date.parse(resumeDate);
  if (Number.isNaN(resumesAtMs) || resumesAtMs <= Date.now()) {
    return NextResponse.json({ error: "resumeDate must be a valid future date" }, { status: 400 });
  }

  const billingStudent = await resolveBillingStudent();
  if (!billingStudent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!billingStudent.stripeSubscriptionId || !billingStudent.stripeAccount) {
    return NextResponse.json({ error: "No billing account found for this student." }, { status: 404 });
  }

  const client = getStripeClient(billingStudent.stripeAccount);
  await client.subscriptions.update(billingStudent.stripeSubscriptionId, {
    pause_collection: { behavior: "void", resumes_at: Math.floor(resumesAtMs / 1000) },
  });

  return NextResponse.json({ success: true });
}

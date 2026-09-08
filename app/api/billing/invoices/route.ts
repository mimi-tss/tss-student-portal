import { NextResponse } from "next/server";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { getStripeClient } from "@/lib/stripe/client";

// Links straight to Stripe's own hosted_invoice_url/invoice_pdf — no
// proxying. That's Stripe's own recommended pattern for this, and these
// URLs are already the intended public hand-off point.
export async function GET() {
  const billingStudent = await resolveBillingStudent();
  if (!billingStudent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!billingStudent.stripeCustomerId || !billingStudent.stripeAccount) {
    return NextResponse.json({ invoices: [] });
  }

  const client = getStripeClient(billingStudent.stripeAccount);
  const invoices = await client.invoices.list({ customer: billingStudent.stripeCustomerId, limit: 24 });

  return NextResponse.json({
    invoices: invoices.data.map((inv) => ({
      id: inv.id,
      date: inv.created ? new Date(inv.created * 1000).toISOString() : null,
      amountPaid: inv.amount_paid,
      currency: inv.currency,
      status: inv.status,
      pdfUrl: inv.invoice_pdf ?? null,
      hostedUrl: inv.hosted_invoice_url ?? null,
    })),
  });
}

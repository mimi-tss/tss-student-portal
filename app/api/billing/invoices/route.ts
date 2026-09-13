import { NextResponse } from "next/server";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { getStripeClient } from "@/lib/stripe/client";

interface InvoiceEntry {
  id: string;
  date: string | null;
  description: string | null;
  amountPaid: number;
  currency: string;
  downloadUrl: string | null;
}

// Merges two different Stripe object types into one list — subscription
// billing produces real Invoice objects (invoice_pdf), but a one-time
// add-on purchase (app/api/billing/addons/purchase) is a bare
// PaymentIntent/Charge with no Invoice at all (receipt_url instead).
// The student shouldn't have to know the difference; this just hands
// back one unified, date-sorted list. Links straight to Stripe's own
// hosted_invoice_url/invoice_pdf/receipt_url — no proxying, Stripe's own
// recommended hand-off point either way.
export async function GET() {
  const billingStudent = await resolveBillingStudent();
  if (!billingStudent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!billingStudent.stripeCustomerId || !billingStudent.stripeAccount) {
    return NextResponse.json({ invoices: [] });
  }

  const client = getStripeClient(billingStudent.stripeAccount);
  const [invoices, charges] = await Promise.all([
    client.invoices.list({ customer: billingStudent.stripeCustomerId, limit: 24 }),
    client.charges.list({ customer: billingStudent.stripeCustomerId, limit: 24 }),
  ]);

  const invoiceEntries: InvoiceEntry[] = invoices.data.map((inv) => ({
    id: inv.id,
    date: inv.created ? new Date(inv.created * 1000).toISOString() : null,
    description: null,
    amountPaid: inv.amount_paid,
    currency: inv.currency,
    downloadUrl: inv.invoice_pdf ?? null,
  }));

  // Only our own add-on charges — identified by the addon_id metadata
  // every one carries (set in app/api/billing/addons/purchase/route.ts),
  // not by the absence of an invoice link (this Stripe SDK version
  // doesn't even expose `invoice` on Charge). A subscription payment's
  // charge never has this key, so there's no risk of double-listing the
  // same money under both an Invoice entry and a charge entry here.
  const chargeEntries: InvoiceEntry[] = charges.data
    .filter((c) => c.paid && !c.refunded && c.metadata?.addon_id)
    .map((c) => ({
      id: c.id,
      date: c.created ? new Date(c.created * 1000).toISOString() : null,
      description: c.description,
      amountPaid: c.amount,
      currency: c.currency,
      downloadUrl: c.receipt_url ?? null,
    }));

  const merged = [...invoiceEntries, ...chargeEntries].sort((a, b) => {
    const at = a.date ? new Date(a.date).getTime() : 0;
    const bt = b.date ? new Date(b.date).getTime() : 0;
    return bt - at;
  });

  return NextResponse.json({ invoices: merged });
}

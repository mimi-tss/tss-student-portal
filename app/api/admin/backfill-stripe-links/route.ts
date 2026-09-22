import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findStripeCustomerAcrossAccounts } from "@/lib/stripe/accounts";

// One-off maintenance route: the Billing tab (app/(admin)/admin/billing/
// page.tsx) only lists students with a stripe_customer_id, and
// resolveBillingStudent's lazy-link (lib/billing/student-stripe-link.ts)
// only runs when THAT student visits /billing themselves. Confirmed live
// that 97 of 114 active students had never been linked — 70 from a
// single bulk-import batch (2026-08-31 22:03), 27 individually
// manual-added since (same pattern as Ivan Pena's account). This runs
// the same cross-account email lookup as the lazy-link, in bulk, so
// students don't have to visit Billing themselves to appear on it.
// CRON_SECRET-gated rather than admin-session-gated since it's triggered
// manually via curl, not from the UI — same auth pattern as the GitHub
// Actions cron routes (see app/api/cron/scan-recordings/route.ts).
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: students, error } = await admin
    .from("students")
    .select("id, name, email, subscription_status")
    .is("stripe_customer_id", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const linked: { id: string; name: string; account: string; customerId: string }[] = [];
  const notFound: { id: string; name: string; email: string }[] = [];

  for (const student of students ?? []) {
    const found = await findStripeCustomerAcrossAccounts(student.email);
    if (!found) {
      notFound.push({ id: student.id, name: student.name, email: student.email });
      continue;
    }

    await admin
      .from("students")
      .update({
        stripe_customer_id: found.customerId,
        stripe_subscription_id: found.subscriptionId,
        stripe_account: found.account,
      })
      .eq("id", student.id);

    linked.push({ id: student.id, name: student.name, account: found.account, customerId: found.customerId });
  }

  return NextResponse.json({ checked: students?.length ?? 0, linked, notFound });
}

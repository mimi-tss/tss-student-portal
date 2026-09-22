import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findStripeCustomerAcrossAccounts } from "@/lib/stripe/accounts";
import { isAdminRole } from "@/lib/auth/roles";

// One-off maintenance route: the Billing tab (app/(admin)/admin/billing/
// page.tsx) only lists students with a stripe_customer_id, and
// resolveBillingStudent's lazy-link (lib/billing/student-stripe-link.ts)
// only runs when THAT student visits /billing themselves. Confirmed live
// that 97 of 114 active students had never been linked — 70 from a
// single bulk-import batch (2026-08-31 22:03), 27 individually
// manual-added since (same pattern as Ivan Pena's account). This runs
// the same cross-account email lookup as the lazy-link, in bulk, so
// students don't have to visit Billing themselves to appear on it.
// Admin-session-gated (not CRON_SECRET) so it can be triggered by just
// visiting the URL in a logged-in admin browser tab — CRON_SECRET on
// Vercel is a write-only Secret type, unreadable after creation, so it
// couldn't be copied out to run this by hand. GET (not POST) for the
// same reason: a URL bar visit is the only trigger available here.
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  return isAdminRole(profile?.role);
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
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

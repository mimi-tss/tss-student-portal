import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripeClient } from "@/lib/stripe/client";
import { isAdminRole } from "@/lib/auth/roles";
import type { StripeAccount } from "@/types/database";

// Admin diagnostic: everything Stripe has for ONE customer — every
// subscription (any status), subscription schedules (a subscription set
// to start later has no Subscription object yet), recent invoices and
// charges. For when the portal finds "no subscription" on a customer
// admin knows is paying (confirmed live: TJ Crawford, Alyssa Kennedy).
// Read-only. GET so it runs from a logged-in admin tab:
//   /api/admin/stripe-customer?account=opus&customer=cus_...
// `account` also accepts the dashboard's acct_ id.
const ACCOUNT_BY_DASHBOARD_ID: Record<string, StripeAccount> = {
  acct_1O2IM7DqBtxGufr8: "opus",
  acct_1CeS1rGHSQxxAtka: "own",
};

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user?.id ?? "").maybeSingle();
  if (!isAdminRole(profile?.role)) return NextResponse.json({ error: "admin only" }, { status: 403 });

  const rawAccount = req.nextUrl.searchParams.get("account") ?? "";
  const account = (ACCOUNT_BY_DASHBOARD_ID[rawAccount] ?? rawAccount) as StripeAccount;
  const customerId = req.nextUrl.searchParams.get("customer");
  if ((account !== "own" && account !== "opus") || !customerId) {
    return NextResponse.json({ error: "account (own|opus|acct_…) and customer required" }, { status: 400 });
  }

  const client = getStripeClient(account);
  const date = (t: number | null | undefined) => (t ? new Date(t * 1000).toISOString().slice(0, 10) : null);

  try {
    const [customer, subs, schedules, invoices, charges] = await Promise.all([
      client.customers.retrieve(customerId),
      client.subscriptions.list({ customer: customerId, status: "all", limit: 20 }),
      client.subscriptionSchedules.list({ customer: customerId, limit: 20 }),
      client.invoices.list({ customer: customerId, limit: 10 }),
      client.charges.list({ customer: customerId, limit: 10 }),
    ]);

    return NextResponse.json({
      customer: "deleted" in customer && customer.deleted
        ? { id: customerId, deleted: true }
        : { id: customer.id, email: customer.email, name: customer.name, created: date(customer.created) },
      subscriptions: subs.data.map((s) => ({
        id: s.id,
        status: s.status,
        period: s.items.data[0]?.price?.recurring
          ? `every ${s.items.data[0].price.recurring.interval_count} ${s.items.data[0].price.recurring.interval}`
          : null,
        price: s.items.data[0]?.price?.nickname ?? s.items.data[0]?.price?.id ?? null,
        amount: s.items.data[0]?.price?.unit_amount != null ? s.items.data[0].price.unit_amount / 100 : null,
        currentPeriodEnd: date(s.items.data[0]?.current_period_end),
        pauseCollection: s.pause_collection,
        cancelAt: date(s.cancel_at),
        created: date(s.created),
      })),
      schedules: schedules.data.map((sch) => ({
        id: sch.id,
        status: sch.status,
        startsAt: date(sch.phases[0]?.start_date),
        subscription: typeof sch.subscription === "string" ? sch.subscription : sch.subscription?.id ?? null,
      })),
      invoices: invoices.data.map((i) => ({
        id: i.id,
        status: i.status,
        amount: i.amount_due / 100,
        created: date(i.created),
        collection: i.collection_method,
        subscription: (() => {
          const sub = i.parent?.subscription_details?.subscription;
          return typeof sub === "string" ? sub : sub?.id ?? null;
        })(),
      })),
      charges: charges.data.map((c) => ({
        id: c.id,
        paid: c.paid,
        refunded: c.refunded,
        amount: c.amount / 100,
        created: date(c.created),
        description: c.description,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

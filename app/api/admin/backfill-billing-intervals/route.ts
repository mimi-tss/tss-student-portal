import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe/client";
import { billingIntervalFromPrice } from "@/lib/stripe/tiers";
import { paidThroughEnd } from "@/lib/scheduling/recurring";
import { isAdminRole } from "@/lib/auth/roles";
import type { StripeAccount } from "@/types/database";

// One-off maintenance route: students.billing_interval was only ever set
// for manually-provisioned students, and the subscription webhook only
// started mirroring it once paidThroughEnd began reading it — so every
// existing 6-month/yearly Stripe subscriber would otherwise be treated
// as monthly (only seeing a month of lessons ahead) until their next
// subscription event. This finds each linked student's live subscription
// — across both Stripe accounts AND every customer record with their
// email, relinking if it isn't the one we had — and stores its interval.
// Students with no subscription anywhere get their recent charges listed
// instead, so a Kajabi-run plan can be worked out by hand. Also reports, for
// every prepaid (non-monthly) student, Stripe's real current_period_end
// next to what paidThroughEnd computes from billing_anniversary_date, so
// a wrong anchor shows up here to be corrected in Edit student.
// Admin-session-gated GET so it runs by visiting the URL in a logged-in
// admin tab (same reasoning as backfill-stripe-links/route.ts).
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

const LIVE_STATUSES = ["active", "trialing", "past_due", "unpaid", "paused"];
const ACCOUNTS: StripeAccount[] = ["own", "opus"];

function describePeriod(price: Stripe.Price | null | undefined): string {
  const r = price?.recurring;
  return r ? `every ${r.interval_count} ${r.interval}` : "one-time";
}

// Every live subscription for this email across BOTH accounts and EVERY
// customer record with that email — a student can have several (Kajabi
// creates a fresh Customer per purchase on Opus), and the original link
// (findStripeCustomerAcrossAccounts) only ever looked at the first one.
async function findLiveSubscriptions(email: string) {
  const found: { account: StripeAccount; customerId: string; subscription: Stripe.Subscription }[] = [];
  for (const account of ACCOUNTS) {
    const client = getStripeClient(account);
    const customers = await client.customers.list({ email, limit: 20 });
    for (const customer of customers.data) {
      const subs = await client.subscriptions.list({ customer: customer.id, status: "all", limit: 10 });
      for (const sub of subs.data) {
        if (LIVE_STATUSES.includes(sub.status)) found.push({ account, customerId: customer.id, subscription: sub });
      }
    }
  }
  return found;
}

// Recent successful charges for this email across both accounts — for
// students with no subscription at all (e.g. Kajabi-run recurring
// billing, which charges off-session rather than via a Stripe
// Subscription), so admin can see the amounts/dates and work out the
// plan by hand.
async function recentCharges(email: string) {
  const out: { account: StripeAccount; date: string; amount: string; description: string | null }[] = [];
  for (const account of ACCOUNTS) {
    const client = getStripeClient(account);
    const customers = await client.customers.list({ email, limit: 20 });
    for (const customer of customers.data) {
      const charges = await client.charges.list({ customer: customer.id, limit: 5 });
      for (const c of charges.data.filter((c) => c.paid && !c.refunded)) {
        out.push({
          account,
          date: new Date(c.created * 1000).toISOString().slice(0, 10),
          amount: `${(c.amount / 100).toFixed(2)} ${c.currency.toUpperCase()}`,
          description: c.description,
        });
      }
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: students, error } = await admin
    .from("students")
    .select("id, name, email, stripe_customer_id, stripe_subscription_id, stripe_account, billing_interval, billing_anniversary_date")
    .not("stripe_customer_id", "is", null)
    .eq("archived", false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  const prepaid: { name: string; interval: string; stripePeriodEnd: string | null; computedPaidThrough: string; anchor: string | null }[] = [];
  const unusualPeriod: { name: string; period: string; price: string | null }[] = [];
  const relinked: { name: string; account: string; customerId: string; subscriptionId: string }[] = [];
  const multipleSubscriptions: { name: string; subscriptions: string[] }[] = [];
  const noSubscription: { name: string; email: string; recentCharges: Awaited<ReturnType<typeof recentCharges>> }[] = [];
  const failed: { name: string; error: string }[] = [];

  for (const student of students ?? []) {
    try {
      const live = await findLiveSubscriptions(student.email);

      if (live.length === 0) {
        noSubscription.push({ name: student.name, email: student.email, recentCharges: await recentCharges(student.email) });
        continue;
      }
      if (live.length > 1) {
        multipleSubscriptions.push({
          name: student.name,
          subscriptions: live.map((l) => `${l.account} ${l.subscription.id} ${l.subscription.status} ${describePeriod(l.subscription.items.data[0]?.price)}`),
        });
        continue;
      }

      const { account, customerId, subscription } = live[0];
      const item = subscription.items.data[0];

      // The live subscription sits on a different customer/account than
      // the one we linked — relink, so Billing, Get portal link and the
      // subscription webhook all follow the real one from now on.
      if (customerId !== student.stripe_customer_id || subscription.id !== student.stripe_subscription_id || account !== student.stripe_account) {
        await admin
          .from("students")
          .update({ stripe_customer_id: customerId, stripe_subscription_id: subscription.id, stripe_account: account })
          .eq("id", student.id);
        relinked.push({ name: student.name, account, customerId, subscriptionId: subscription.id });
      }

      const interval = billingIntervalFromPrice(item?.price);
      counts[interval ?? "unusual"] = (counts[interval ?? "unusual"] ?? 0) + 1;
      if (!interval) {
        unusualPeriod.push({ name: student.name, period: describePeriod(item?.price), price: item?.price?.nickname ?? item?.price?.id ?? null });
        continue;
      }

      if (interval !== student.billing_interval) {
        await admin.from("students").update({ billing_interval: interval }).eq("id", student.id);
      }

      if (interval !== "monthly") {
        prepaid.push({
          name: student.name,
          interval,
          stripePeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString().slice(0, 10) : null,
          computedPaidThrough: paidThroughEnd(student.billing_anniversary_date, interval).toISOString().slice(0, 10),
          anchor: student.billing_anniversary_date,
        });
      }
    } catch (err) {
      failed.push({ name: student.name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    checked: students?.length ?? 0,
    counts,
    prepaid,
    unusualPeriod,
    relinked,
    multipleSubscriptions,
    noSubscription,
    failed,
  });
}

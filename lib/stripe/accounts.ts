import { stripe, stripeOpus } from "@/lib/stripe/client";
import type { StripeAccount } from "@/types/database";

// Opus→own migration (app/api/billing/migrate/*): an Opus-linked
// student moving to current billing needs a Customer on the "own"
// account, which they may not have at all yet. Reuses one if a prior
// attempt already created it (e.g. the student abandoned the flow after
// the SetupIntent step) rather than creating a duplicate every retry.
export async function findOrCreateOwnCustomer(email: string, name: string): Promise<string> {
  const existing = await stripe.customers.list({ email, limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
  const created = await stripe.customers.create({ email, name });
  return created.id;
}

const LIVE_STATUSES = ["active", "trialing", "past_due", "unpaid", "paused"];

// The subscription that represents this customer's current plan: a live
// one if any (newest first, as Stripe lists them), else the most recent
// of any status. null if the customer has never had one.
export async function pickCustomerSubscriptionId(account: StripeAccount, customerId: string): Promise<string | null> {
  const client = account === "opus" ? stripeOpus : stripe;
  const subs = await client.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
  return (subs.data.find((s) => LIVE_STATUSES.includes(s.status)) ?? subs.data[0])?.id ?? null;
}

// Cross-account customer lookup for a student who hasn't been linked to
// either Stripe account yet (a pre-migration Opus customer visiting
// /billing/account for the first time — see app/api/billing/subscription/
// route.ts's lazy link-on-first-view). One email can have SEVERAL
// customers across both accounts (confirmed live: 19 students' live
// subscriptions sat on a different customer than the first one found,
// and Greg Popcak / Florate Israel / Tal Zadok got linked to a stale Opus
// customer that way) — so this checks every customer on both accounts
// and prefers one with a live subscription. Only if none has one does it
// fall back to the first customer found, Opus first per the studio's
// stated ordering.
export async function findStripeCustomerAcrossAccounts(
  email: string,
): Promise<{ account: StripeAccount; customerId: string; subscriptionId: string | null } | null> {
  const accounts: { account: StripeAccount; client: typeof stripe }[] = [
    { account: "opus", client: stripeOpus },
    { account: "own", client: stripe },
  ];

  let fallback: { account: StripeAccount; customerId: string; subscriptionId: string | null } | null = null;
  for (const { account, client } of accounts) {
    const customers = await client.customers.list({ email, limit: 20 });
    for (const customer of customers.data) {
      const subs = await client.subscriptions.list({ customer: customer.id, status: "all", limit: 10 });
      const live = subs.data.find((s) => LIVE_STATUSES.includes(s.status));
      if (live) return { account, customerId: customer.id, subscriptionId: live.id };
      fallback ??= { account, customerId: customer.id, subscriptionId: subs.data[0]?.id ?? null };
    }
  }

  return fallback;
}

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

// Cross-account customer lookup for a student who hasn't been linked to
// either Stripe account yet (a pre-migration Opus customer visiting
// /billing/account for the first time — see app/api/billing/subscription/
// route.ts's lazy link-on-first-view). Opus first, then the current
// account, per the studio's own stated ordering — new signups only ever
// land in "own", so a genuinely new customer will simply miss on Opus
// and get found on the second check.
export async function findStripeCustomerAcrossAccounts(
  email: string,
): Promise<{ account: StripeAccount; customerId: string; subscriptionId: string | null } | null> {
  const accounts: { account: StripeAccount; client: typeof stripe }[] = [
    { account: "opus", client: stripeOpus },
    { account: "own", client: stripe },
  ];

  for (const { account, client } of accounts) {
    const customers = await client.customers.list({ email, limit: 1 });
    const customer = customers.data[0];
    if (!customer) continue;

    const subs = await client.subscriptions.list({ customer: customer.id, status: "all", limit: 1 });
    return { account, customerId: customer.id, subscriptionId: subs.data[0]?.id ?? null };
  }

  return null;
}

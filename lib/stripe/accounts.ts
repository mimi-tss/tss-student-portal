import { stripe, stripeOpus } from "@/lib/stripe/client";
import type { StripeAccount } from "@/types/database";

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

import { stripe } from "@/lib/stripe/client";
import { STRIPE_PRICE_BY_TIER, BILLING_INTERVALS, type BillingInterval } from "@/lib/stripe/tiers";
import { addonsForTier, resolveAddonPriceId } from "@/lib/billing/addons";
import type { Tier } from "@/types/database";

export interface CreateSubscriptionCheckoutInput {
  tier: Tier;
  interval: BillingInterval;
  addonIds?: string[];
  // Admin-initiated checkout only (app/api/admin/create-checkout-link) —
  // the public pricing page never has an email to prefill, Stripe just
  // asks the customer for one. Passed straight to Stripe's own
  // customer_email so the hosted page arrives pre-filled; the customer
  // can still change it before paying.
  email?: string;
}

export type CreateSubscriptionCheckoutResult =
  | { success: true; url: string }
  | { success: false; error: string; status: number };

// Shared by the public pricing page's own checkout
// (app/api/billing/checkout/route.ts) and admin's "generate a real
// Stripe subscription" action on the Add ambassador/manual student form
// (app/api/admin/create-checkout-link/route.ts) — same Session shape
// either way, since both ultimately produce the exact same kind of
// subscription this app's webhook already knows how to provision a
// student from (see app/api/webhooks/stripe/route.ts). Extracted here
// rather than duplicated so a change to one (e.g. a new payment method
// type, a Terms-of-Service update) can't silently drift between the two
// callers.
export async function createSubscriptionCheckoutSession(
  input: CreateSubscriptionCheckoutInput,
): Promise<CreateSubscriptionCheckoutResult> {
  const { tier, interval, addonIds, email } = input;

  if (!BILLING_INTERVALS.includes(interval)) {
    return { success: false, error: "A valid interval is required", status: 400 };
  }

  const price = STRIPE_PRICE_BY_TIER[tier][interval];
  if (!price) {
    return { success: false, error: `${interval} billing isn't available for this plan.`, status: 400 };
  }

  // Add-ons bundled into the same Checkout Session — see
  // app/billing/addons-select's own pre-checkout step. Every downstream
  // reader of a subscription's items (webhooks, .../addons/route.ts,
  // request-change-plan, etc.) assumes items.data[0] is the tier's own
  // price, so the tier's line item MUST stay first here — every add-on
  // line item goes after it, never before.
  const lineItems: { price: string; quantity: number }[] = [{ price, quantity: 1 }];

  if (Array.isArray(addonIds) && addonIds.length > 0) {
    const catalog = addonsForTier(tier);
    for (const id of addonIds) {
      if (typeof id !== "string") continue;
      const addon = catalog.find((a) => a.id === id);
      if (!addon) {
        return { success: false, error: "That add-on isn't available for this plan.", status: 400 };
      }
      const addonPrice = resolveAddonPriceId(addon, tier);
      if (!addonPrice) {
        return { success: false, error: `${addon.label} isn't available right now.`, status: 400 };
      }
      lineItems.push({ price: addonPrice, quantity: 1 });
    }
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: lineItems,
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
    metadata: { tier },
    subscription_data: { metadata: { tier } },
    ...(email ? { customer_email: email } : {}),
    // Card + Link only — both work in any currency/country, which
    // matters since prices are USD and SEPA/most other alternative
    // methods either require a matching local currency or don't support
    // recurring billing at all.
    payment_method_types: ["card", "link"],
    consent_collection: { terms_of_service: "required" },
    custom_text: {
      terms_of_service_acceptance: {
        message: "I agree to the Terms of Service, including the Publicity Release.",
      },
    },
  });

  if (!session.url) {
    return { success: false, error: "Couldn't start checkout — try again.", status: 500 };
  }

  return { success: true, url: session.url };
}

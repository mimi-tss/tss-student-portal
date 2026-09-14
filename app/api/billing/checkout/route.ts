import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { STRIPE_PRICE_BY_TIER, BILLING_INTERVALS, type BillingInterval } from "@/lib/stripe/tiers";
import { addonsForTier, resolveAddonPriceId } from "@/lib/billing/addons";
import type { Tier } from "@/types/database";

// Elite is application-only (see lib/billing/tier-copy.ts) — the public
// pricing page sends it to a mailto instead of Checkout, and this rejects
// a direct POST too.
const VALID_TIERS: Tier[] = ["lite", "suite", "pro"];

// Unauthenticated by design — this is the public signup path (new
// student, no account yet). Stripe Checkout is fully hosted: no card
// data ever touches this codebase, so there's nothing here to protect
// beyond picking a valid tier/interval. Always pulls from
// STRIPE_PRICE_BY_TIER (the current, public price) — never from a price
// ID supplied by the client — which is what keeps every grandfathered/
// legacy price invisible here regardless of how many exist in Stripe.
export async function POST(req: NextRequest) {
  const { tier, interval = "monthly", addonIds } = await req.json();

  if (typeof tier !== "string" || !VALID_TIERS.includes(tier as Tier)) {
    return NextResponse.json({ error: "A valid tier is required" }, { status: 400 });
  }
  if (!BILLING_INTERVALS.includes(interval)) {
    return NextResponse.json({ error: "A valid interval is required" }, { status: 400 });
  }

  const price = STRIPE_PRICE_BY_TIER[tier as Tier][interval as BillingInterval];
  if (!price) {
    return NextResponse.json({ error: `${interval} billing isn't available for this plan.` }, { status: 400 });
  }

  // Optional add-ons selected on the pre-checkout add-ons step
  // (app/billing/addons-select) — bundled into this same Checkout
  // Session rather than requiring a second purchase after signup.
  // Every downstream reader of a subscription's items (webhooks,
  // .../addons/route.ts, request-change-plan, etc.) assumes
  // `items.data[0]` is the tier's own price — see lib/billing/addons.ts
  // and app/api/billing/request-change-plan/route.ts's own
  // `items.data.slice(1)` — so the tier's line item MUST stay first in
  // this array; every add-on line item goes after it, never before.
  // A "one_time" add-on Price works fine mixed into a subscription-mode
  // Checkout Session: Stripe bills it once on the first invoice and
  // never turns it into a recurring subscription item, exactly like a
  // one-off setup fee alongside a subscription.
  const lineItems: { price: string; quantity: number }[] = [{ price, quantity: 1 }];

  if (Array.isArray(addonIds) && addonIds.length > 0) {
    const catalog = addonsForTier(tier as Tier);
    for (const id of addonIds) {
      if (typeof id !== "string") continue;
      const addon = catalog.find((a) => a.id === id);
      if (!addon) {
        return NextResponse.json({ error: `That add-on isn't available for this plan.` }, { status: 400 });
      }
      const addonPrice = resolveAddonPriceId(addon, tier as Tier);
      if (!addonPrice) {
        return NextResponse.json({ error: `${addon.label} isn't available right now.` }, { status: 400 });
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
    // Card + Link only — both work in any currency/country, which
    // matters since prices are USD (confirmed against the real Stripe
    // catalog) and SEPA/most other alternative methods either require a
    // matching local currency or don't support recurring billing at
    // all. Checked against the studio's actual international student
    // list: overwhelmingly US, with only 2 in the Eurozone — not enough
    // to justify SEPA's added complexity even if pricing were EUR.
    payment_method_types: ["card", "link"],
    // Single mandatory checkbox, no opt-out — deliberately not Spotify's
    // separate marketing/data-sharing checkboxes (we don't do third-party
    // data sharing, and the publicity release isn't optional). Stripe
    // renders this against the Terms of Service URL configured in the
    // Dashboard (Settings → Business → Public details), not a per-session
    // URL — that URL must point at a doc covering both the Terms and the
    // Publicity Release once one exists; until then this checkbox has
    // nowhere real to link and shouldn't be treated as fully wired up.
    consent_collection: { terms_of_service: "required" },
    custom_text: {
      terms_of_service_acceptance: {
        message: "I agree to the Terms of Service, including the Publicity Release.",
      },
    },
  });

  if (!session.url) {
    return NextResponse.json({ error: "Couldn't start checkout — try again." }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}

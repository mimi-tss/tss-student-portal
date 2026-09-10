import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { STRIPE_PRICE_BY_TIER, type BillingInterval } from "@/lib/stripe/tiers";
import type { Tier } from "@/types/database";

const VALID_TIERS: Tier[] = ["lite", "suite", "pro", "elite"];
const VALID_INTERVALS: BillingInterval[] = ["monthly", "yearly"];

// Unauthenticated by design — this is the public signup path (new
// student, no account yet). Stripe Checkout is fully hosted: no card
// data ever touches this codebase, so there's nothing here to protect
// beyond picking a valid tier/interval. Always pulls from
// STRIPE_PRICE_BY_TIER (the current, public price) — never from a price
// ID supplied by the client — which is what keeps every grandfathered/
// legacy price invisible here regardless of how many exist in Stripe.
export async function POST(req: NextRequest) {
  const { tier, interval = "monthly" } = await req.json();

  if (typeof tier !== "string" || !VALID_TIERS.includes(tier as Tier)) {
    return NextResponse.json({ error: "A valid tier is required" }, { status: 400 });
  }
  if (!VALID_INTERVALS.includes(interval)) {
    return NextResponse.json({ error: "A valid interval is required" }, { status: 400 });
  }

  const price = STRIPE_PRICE_BY_TIER[tier as Tier][interval as BillingInterval];
  if (!price) {
    return NextResponse.json({ error: `${interval} billing isn't available for this plan.` }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
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

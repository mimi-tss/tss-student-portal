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
    success_url: `${process.env.NEXT_PUBLIC_BILLING_URL}/billing/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_BILLING_URL}/billing`,
    metadata: { tier },
    subscription_data: { metadata: { tier } },
  });

  if (!session.url) {
    return NextResponse.json({ error: "Couldn't start checkout — try again." }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}

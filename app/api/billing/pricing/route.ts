import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { STRIPE_PRICE_BY_TIER } from "@/lib/stripe/tiers";
import type { Tier } from "@/types/database";

const TIERS: Tier[] = ["lite", "suite", "pro", "elite"];

// Live price amounts for the public pricing page — fetched from Stripe
// rather than hardcoded copy, so the page never drifts out of sync with
// whatever's actually configured in STRIPE_PRICE_BY_TIER (a Dashboard
// price change takes effect here with no code edit).
export async function GET() {
  const entries = await Promise.all(
    TIERS.map(async (tier) => {
      const ids = STRIPE_PRICE_BY_TIER[tier];
      const [monthly, yearly] = await Promise.all([
        ids.monthly ? stripe.prices.retrieve(ids.monthly) : null,
        ids.yearly ? stripe.prices.retrieve(ids.yearly) : null,
      ]);

      return [
        tier,
        {
          monthly: monthly ? { amount: monthly.unit_amount, currency: monthly.currency } : null,
          yearly: yearly ? { amount: yearly.unit_amount, currency: yearly.currency } : null,
        },
      ] as const;
    }),
  );

  return NextResponse.json({ pricing: Object.fromEntries(entries) });
}

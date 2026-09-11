import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { STRIPE_PRICE_BY_TIER, BILLING_INTERVALS } from "@/lib/stripe/tiers";
import type { Tier } from "@/types/database";

const TIERS: Tier[] = ["lite", "suite", "pro", "elite"];

// Live price amounts for the public pricing page — fetched from Stripe
// rather than hardcoded copy, so the page never drifts out of sync with
// whatever's actually configured in STRIPE_PRICE_BY_TIER (a Dashboard
// price change takes effect here with no code edit). Iterates
// BILLING_INTERVALS rather than hardcoding monthly/yearly, so a new
// interval (e.g. a limited-time 3-month/6-month promo) just needs its
// env var set — nothing here to touch.
export async function GET() {
  const entries = await Promise.all(
    TIERS.map(async (tier) => {
      const ids = STRIPE_PRICE_BY_TIER[tier];
      const prices = await Promise.all(
        BILLING_INTERVALS.map((interval) => (ids[interval] ? stripe.prices.retrieve(ids[interval]!) : null)),
      );

      const byInterval = Object.fromEntries(
        BILLING_INTERVALS.map((interval, i) => {
          const price = prices[i];
          return [interval, price ? { amount: price.unit_amount, currency: price.currency } : null];
        }),
      );

      return [tier, byInterval] as const;
    }),
  );

  return NextResponse.json({ pricing: Object.fromEntries(entries) });
}

import type Stripe from "stripe";
import type { Tier } from "@/types/database";

// The ONE canonical, current price per tier — used only to pick what a
// brand-new signup gets charged (app/api/billing/checkout). Price IDs
// come from Stripe Dashboard → Product catalog (test and live mode each
// have their own) — set per environment in Vercel, not hardcoded here.
export const STRIPE_PRICE_BY_TIER: Record<Tier, string> = {
  lite: process.env.STRIPE_PRICE_LITE!,
  suite: process.env.STRIPE_PRICE_SUITE!,
  pro: process.env.STRIPE_PRICE_PRO!,
  elite: process.env.STRIPE_PRICE_ELITE!,
};

export const TIER_LABEL: Record<Tier, string> = {
  lite: "Lite",
  suite: "Suite",
  pro: "Pro",
  elite: "Elite",
};

const VALID_TIERS: readonly Tier[] = ["lite", "suite", "pro", "elite"];

// Resolves a tier from a Stripe Price's own metadata (`tier: "suite"`,
// etc.) rather than a hardcoded price-ID list — different students pay
// different amounts for the same tier depending on when they signed up
// or what promo they were on, across two Stripe accounts, so there's no
// single "the Suite price" to match against. Every Price that should
// ever appear on a real subscription — the 4 current ones above AND
// every legacy/grandfathered one in either account — needs `tier` set
// in its Stripe Dashboard metadata for this to resolve it; a Price
// without that metadata resolves to null and the caller keeps whatever
// tier it already had rather than guessing (see
// app/api/webhooks/stripe/route.ts's own null-guard on this).
export function resolveTierFromPrice(price: Stripe.Price | null | undefined): Tier | null {
  const tier = price?.metadata?.tier;
  return tier && (VALID_TIERS as readonly string[]).includes(tier) ? (tier as Tier) : null;
}

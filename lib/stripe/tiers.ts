import type { Tier } from "@/types/database";

// Price IDs come from Stripe Dashboard → Product catalog (test and live
// mode each have their own) — set per environment in Vercel, not
// hardcoded here. Mirrors lib/kajabi/offers.ts's OFFER_IDS/TIER_BY_OFFER_ID
// shape, same reasoning: cheap enough at 4 tiers not to need a DB table.
export const STRIPE_PRICE_BY_TIER: Record<Tier, string> = {
  lite: process.env.STRIPE_PRICE_LITE!,
  suite: process.env.STRIPE_PRICE_SUITE!,
  pro: process.env.STRIPE_PRICE_PRO!,
  elite: process.env.STRIPE_PRICE_ELITE!,
};

export const TIER_BY_STRIPE_PRICE_ID: Record<string, Tier> = {
  [STRIPE_PRICE_BY_TIER.lite]: "lite",
  [STRIPE_PRICE_BY_TIER.suite]: "suite",
  [STRIPE_PRICE_BY_TIER.pro]: "pro",
  [STRIPE_PRICE_BY_TIER.elite]: "elite",
};

export const TIER_LABEL: Record<Tier, string> = {
  lite: "Lite",
  suite: "Suite",
  pro: "Pro",
  elite: "Elite",
};

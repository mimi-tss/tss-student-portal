import type Stripe from "stripe";
import type { Tier } from "@/types/database";

export type BillingInterval = "monthly" | "yearly";

// The canonical, CURRENT prices per tier — used only to pick what a
// brand-new signup gets charged (app/api/billing/checkout). Every other
// price that exists in Stripe (grandfathered/legacy rates) is
// deliberately never referenced here — that's what keeps it invisible to
// new signups, see app/api/billing/checkout/route.ts's own comment.
// `yearly` is optional per tier (e.g. a free Lite tier has no reason to
// offer a yearly option) — env var simply left unset. Price IDs come
// from Stripe Dashboard → Product catalog (test and live mode each have
// their own), set per environment in Vercel, not hardcoded here.
export const STRIPE_PRICE_BY_TIER: Record<Tier, Record<BillingInterval, string | null>> = {
  lite: { monthly: process.env.STRIPE_PRICE_LITE_MONTHLY ?? null, yearly: process.env.STRIPE_PRICE_LITE_YEARLY ?? null },
  suite: { monthly: process.env.STRIPE_PRICE_SUITE_MONTHLY ?? null, yearly: process.env.STRIPE_PRICE_SUITE_YEARLY ?? null },
  pro: { monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? null, yearly: process.env.STRIPE_PRICE_PRO_YEARLY ?? null },
  elite: { monthly: process.env.STRIPE_PRICE_ELITE_MONTHLY ?? null, yearly: process.env.STRIPE_PRICE_ELITE_YEARLY ?? null },
};

export const TIER_LABEL: Record<Tier, string> = {
  lite: "Lite",
  suite: "Suite",
  pro: "Pro",
  elite: "Elite",
};

// Shared by every billing UI that shows a price (pricing page, change-plan
// picker, the account page's own amount row) — was drifting into 2-3
// near-identical local copies before this.
export function formatPrice(amount: number | null | undefined, currency: string | null | undefined): string | null {
  if (amount == null || !currency) return null;
  if (amount === 0) return "Free";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
}

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

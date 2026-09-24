import type Stripe from "stripe";
import type { Tier } from "@/types/database";

// "3month"/"6month" exist for time-limited promo pricing (e.g. a 3- or
// 6-month prepaid term offered for a limited window) — no expiry date
// logic in code for that by design (confirmed with the user): the
// option is simply offered for as long as its env var is set, and
// removing the var (then redeploying) is how a promo actually ends.
export type BillingInterval = "monthly" | "3month" | "6month" | "yearly";

// Display + iteration order everywhere this list is shown.
export const BILLING_INTERVALS: BillingInterval[] = ["monthly", "3month", "6month", "yearly"];

export const INTERVAL_LABEL: Record<BillingInterval, string> = {
  monthly: "Monthly",
  "3month": "3 Months",
  "6month": "6 Months",
  yearly: "Yearly",
};

// How many calendar months each interval's price covers — used to work
// out a per-month equivalent and the "Save X%" badge against the
// tier's own monthly price (BILLING_INTERVALS' order elsewhere is
// display order; this is just the length of each billing period).
export const INTERVAL_MONTHS: Record<BillingInterval, number> = {
  monthly: 1,
  "3month": 3,
  "6month": 6,
  yearly: 12,
};

// A Stripe Price's recurring period as one of our BillingIntervals —
// read off the live Price itself, so it covers legacy/grandfathered
// prices too (not just the env-configured current ones). null for a
// one-time price or a period we don't sell.
export function billingIntervalFromPrice(price: Stripe.Price | null | undefined): BillingInterval | null {
  const r = price?.recurring;
  if (!r) return null;
  // Many real subscriptions bill "every 4 weeks" (24 confirmed live) —
  // pay-as-you-go, same as monthly for how far ahead is prepaid.
  if (r.interval === "week" && r.interval_count <= 5) return "monthly";
  const months = r.interval === "year" ? 12 * r.interval_count : r.interval === "month" ? r.interval_count : 0;
  const match = BILLING_INTERVALS.find((i) => INTERVAL_MONTHS[i] === months);
  return match ?? null;
}

const ENV_SUFFIX: Record<BillingInterval, string> = {
  monthly: "MONTHLY",
  "3month": "3MONTH",
  "6month": "6MONTH",
  yearly: "YEARLY",
};

function buildTierPrices(envPrefix: string): Record<BillingInterval, string | null> {
  const entries = BILLING_INTERVALS.map((interval) => [
    interval,
    process.env[`STRIPE_PRICE_${envPrefix}_${ENV_SUFFIX[interval]}`] ?? null,
  ]);
  return Object.fromEntries(entries) as Record<BillingInterval, string | null>;
}

// The canonical, CURRENT prices per tier — used only to pick what a
// brand-new signup gets charged (app/api/billing/checkout). Every other
// price that exists in Stripe (grandfathered/legacy rates) is
// deliberately never referenced here — that's what keeps it invisible to
// new signups, see app/api/billing/checkout/route.ts's own comment. Every
// interval is optional per tier (e.g. a free Lite tier has no reason to
// offer a yearly option) — env var simply left unset, and the UI only
// ever shows a toggle for intervals that actually have a price. Price
// IDs come from Stripe Dashboard → Product catalog (test and live mode
// each have their own), set per environment in Vercel, not hardcoded
// here.
export const STRIPE_PRICE_BY_TIER: Record<Tier, Record<BillingInterval, string | null>> = {
  lite: buildTierPrices("LITE"),
  suite: buildTierPrices("SUITE"),
  pro: buildTierPrices("PRO"),
  elite: buildTierPrices("ELITE"),
};

export const TIER_LABEL: Record<Tier, string> = {
  lite: "Lite",
  suite: "Suite",
  pro: "Pro",
  elite: "Elite",
};

// Ordinal ranking — lower is cheaper/fewer features. Used only to tell
// an upgrade from a downgrade when a student picks a target tier on the
// Change Plan picker (app/billing/account/change-plan-client.tsx); has
// nothing to do with checkout or price lookups.
export const TIER_RANK: Record<Tier, number> = { lite: 0, suite: 1, pro: 2, elite: 3 };

// Shared by every billing UI that shows a price (pricing page, change-plan
// picker, the account page's own amount row) — was drifting into 2-3
// near-identical local copies before this.
export function formatPrice(amount: number | null | undefined, currency: string | null | undefined): string | null {
  if (amount == null || !currency) return null;
  if (amount === 0) return "Free";
  // Whole-dollar prices (the studio's now-standard pricing — no more
  // .99 endings) drop the trailing ".00" so the price reads cleaner; an
  // amount that does carry real cents still shows them.
  const hasCents = amount % 100 !== 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(amount / 100);
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

// Same idea, but reading the SUBSCRIPTION's own metadata instead of its
// Price's. Needed because a Price can end up permanently un-taggable —
// confirmed live: a Price Stripe creates automatically (e.g. during the
// Opus→own migration's trial_end-anchored subscription creation, see
// app/api/billing/migrate/complete/route.ts) throws "The price was
// created by Stripe automatically and cannot be updated" on any metadata
// write, forever. migrate/complete already anticipated exactly this and
// stamps `tier` onto the subscription itself at creation time — this
// just reads it back. A normal (non-migrated) subscription never has
// this key at all, so it's purely additive.
export function resolveTierFromSubscription(subscription: Stripe.Subscription | null | undefined): Tier | null {
  const tier = subscription?.metadata?.tier;
  return tier && (VALID_TIERS as readonly string[]).includes(tier) ? (tier as Tier) : null;
}

// The one both callers should actually use: Price metadata first (the
// normal, current-signup case), falling back to the subscription's own
// metadata for a migrated account whose Price can never carry it. Order
// only matters in theory — the two populations don't overlap in
// practice — but Price stays primary since it's the long-standing
// convention every other Price-metadata caller already relies on.
export function resolveTier(
  subscription: Stripe.Subscription | null | undefined,
  price: Stripe.Price | null | undefined,
): Tier | null {
  return resolveTierFromPrice(price) ?? resolveTierFromSubscription(subscription);
}

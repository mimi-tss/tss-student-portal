import type { Tier } from "@/types/database";

export interface AddonDef {
  id: string;
  tier: Tier;
  label: string;
  priceEnvVar: string;
}

// Hardcoded per-tier catalog — same convention as STRIPE_PRICE_BY_TIER
// (lib/stripe/tiers.ts): each add-on is a real recurring Stripe Price, its
// env var set per environment (test/live each have their own). Adding a
// new add-on is one more entry here + one new Stripe Price + one new env
// var — no migration needed, and no dollar amount hardcoded here either
// (that's read live off the Stripe Price, like every other price in this
// app — see formatPrice in lib/stripe/tiers.ts).
export const TIER_ADDONS: Record<Tier, AddonDef[]> = {
  lite: [],
  suite: [
    { id: "biweekly_lessons", tier: "suite", label: "Biweekly private lessons", priceEnvVar: "STRIPE_PRICE_ADDON_BIWEEKLY_LESSONS" },
  ],
  pro: [
    { id: "sixty_min_lessons", tier: "pro", label: "60-minute lessons", priceEnvVar: "STRIPE_PRICE_ADDON_SIXTY_MIN_LESSONS" },
  ],
  elite: [],
};

export function addonsForTier(tier: Tier | null | undefined): AddonDef[] {
  return tier ? TIER_ADDONS[tier] : [];
}

export function resolveAddonPriceId(addon: AddonDef): string | null {
  return process.env[addon.priceEnvVar] ?? null;
}

export function findAddon(id: string): AddonDef | null {
  for (const list of Object.values(TIER_ADDONS)) {
    const found = list.find((a) => a.id === id);
    if (found) return found;
  }
  return null;
}

// All Stripe Price IDs valid for a given tier — used by Change Plan to
// drop any add-on subscription item that doesn't belong on the new tier.
export function validAddonPriceIdsForTier(tier: Tier): Set<string> {
  const ids = TIER_ADDONS[tier].map(resolveAddonPriceId).filter((id): id is string => !!id);
  return new Set(ids);
}

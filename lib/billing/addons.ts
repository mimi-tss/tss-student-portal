import type Stripe from "stripe";
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

// Legacy (Opus-account) students can already have an add-on's
// subscription item today — on a Price that isn't the current "own"-
// account one this catalog's priceEnvVar points at. Matching by a single
// hardcoded Price ID would show those as inactive and misreport a
// duplicate on any toggle. Instead, exactly like `tier` metadata
// (resolveTierFromPrice, lib/stripe/tiers.ts), every Price that
// represents a given add-on — old Opus Price or the new "own" one —
// needs `metadata.addon_id` set to that add-on's catalog id in the
// Stripe Dashboard. A Price without it simply doesn't resolve, same
// null-and-move-on posture as tier resolution.
export function resolveAddonFromPrice(price: Stripe.Price | string | null | undefined): AddonDef | null {
  if (!price || typeof price === "string") return null;
  const addonId = price.metadata?.addon_id;
  return addonId ? findAddon(addonId) : null;
}

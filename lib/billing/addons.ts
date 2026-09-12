import type Stripe from "stripe";
import type { Tier } from "@/types/database";

export type AddonKind = "recurring" | "one_time";

export interface AddonDef {
  id: string;
  tiers: Tier[];
  kind: AddonKind;
  label: string;
  description?: string;
  priceEnvVar: string;
  // Drop-In needs a specific scheduled group-lesson spot picked (capacity-
  // capped) before it can be purchased — flagged so the UI/route branch to
  // that flow instead of a plain "Buy" button. See app/api/billing/addons/
  // purchase/route.ts's own header comment.
  requiresGroupLessonSpot?: boolean;
}

// "Any tier" per the studio, means Suite/Pro/Elite — Lite doesn't get
// these (confirmed with the user).
const ANY_PAID_TIER: Tier[] = ["suite", "pro", "elite"];

// Hardcoded catalog — same convention as STRIPE_PRICE_BY_TIER
// (lib/stripe/tiers.ts): each add-on is a real Stripe Price, its env var
// set per environment (test/live each have their own). Adding a new
// add-on is one more entry here + one new Stripe Price + one new env var
// — no migration needed, and no dollar amount hardcoded here either
// (read live off the Stripe Price, like every other price in this app —
// see formatPrice in lib/stripe/tiers.ts).
//
// "recurring" = a second Stripe subscription item, toggled on/off (the
// original build). "one_time" = a straight off-session charge against
// the student's card on file, no ongoing state — buyable repeatedly, no
// "active"/"remove" (see app/api/billing/addons/purchase/route.ts).
export const ADDON_CATALOG: AddonDef[] = [
  {
    id: "biweekly_30min_suite",
    tiers: ["suite"],
    kind: "recurring",
    label: "30-min Biweekly Lessons",
    description: "2 lessons per month",
    priceEnvVar: "STRIPE_PRICE_ADDON_BIWEEKLY_30MIN_SUITE",
  },
  {
    id: "biweekly_60min_suite",
    tiers: ["suite"],
    kind: "recurring",
    label: "60-min Biweekly Lessons",
    description: "2 lessons per month",
    priceEnvVar: "STRIPE_PRICE_ADDON_BIWEEKLY_60MIN_SUITE",
  },
  {
    id: "four_pack_30min_suite",
    tiers: ["suite"],
    kind: "one_time",
    label: "4-Pack 30-min Lessons",
    description: "Schedule anytime within a year",
    priceEnvVar: "STRIPE_PRICE_ADDON_FOUR_PACK_30MIN_SUITE",
  },
  {
    id: "upgrade_60min_pro",
    tiers: ["pro"],
    kind: "recurring",
    label: "Upgrade to 60-min Lessons",
    description: "4 lessons per month",
    priceEnvVar: "STRIPE_PRICE_ADDON_UPGRADE_60MIN_PRO",
  },
  {
    id: "single_lesson_tara_pro",
    tiers: ["pro"],
    kind: "one_time",
    label: "30-min Lesson with Tara Simon",
    priceEnvVar: "STRIPE_PRICE_ADDON_LESSON_WITH_TARA_PRO",
  },
  {
    id: "drop_in_group_lesson",
    tiers: ANY_PAID_TIER,
    kind: "one_time",
    label: "Drop-In Group Lesson",
    description: "Limited to 6 students per spot",
    priceEnvVar: "STRIPE_PRICE_ADDON_DROP_IN_GROUP",
    requiresGroupLessonSpot: true,
  },
  {
    id: "spotlight_recital",
    tiers: ANY_PAID_TIER,
    kind: "one_time",
    label: "Spotlight (Recital)",
    priceEnvVar: "STRIPE_PRICE_ADDON_SPOTLIGHT",
  },
];

export function addonsForTier(tier: Tier | null | undefined): AddonDef[] {
  return tier ? ADDON_CATALOG.filter((a) => a.tiers.includes(tier)) : [];
}

export function resolveAddonPriceId(addon: AddonDef): string | null {
  return process.env[addon.priceEnvVar] ?? null;
}

export function findAddon(id: string): AddonDef | null {
  return ADDON_CATALOG.find((a) => a.id === id) ?? null;
}

// Legacy (Opus-account) students can already have a RECURRING add-on's
// subscription item today — on a Price that isn't the current "own"-
// account one this catalog's priceEnvVar points at. Matching by a single
// hardcoded Price ID would show those as inactive and misreport a
// duplicate on any toggle. Instead, exactly like `tier` metadata
// (resolveTierFromPrice, lib/stripe/tiers.ts), every Price that
// represents a given add-on — old Opus Price or the new "own" one —
// needs `metadata.addon_id` set to that add-on's catalog id in the
// Stripe Dashboard. A Price without it simply doesn't resolve, same
// null-and-move-on posture as tier resolution. Only meaningful for
// "recurring" add-ons — a one_time purchase never sits on a subscription
// item, so there's nothing here to match against.
export function resolveAddonFromPrice(price: Stripe.Price | string | null | undefined): AddonDef | null {
  if (!price || typeof price === "string") return null;
  const addonId = price.metadata?.addon_id;
  return addonId ? findAddon(addonId) : null;
}

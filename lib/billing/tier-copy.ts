import type { Tier } from "@/types/database";
import { TIER_RANK } from "@/lib/stripe/tiers";

// Studio's own marketing copy for the tiers, given directly by the
// studio (not sourced from TSS_App_Spec_1.md — that doc's version is
// now stale). Shared by the public pricing page and the account page's
// Change Plan picker, so the two never drift into different
// descriptions of the same tier.
export const ELITE_APPLICATION_EMAIL = "info@tarasimonstudios.com";

export const TIER_COPY: {
  tier: Tier;
  name: string;
  desc: string;
  features: string[];
  applyOnly?: boolean;
  // Shown only while the yearly interval is selected — see
  // app/billing/tier-card.tsx's "Bonuses on Yearly Membership" block.
  yearlyBonuses?: string[];
}[] = [
  {
    tier: "lite",
    name: "Lite",
    desc: "Free community access — no coaching, but real feedback from fellow vocal athletes.",
    features: [
      "TSS Community Feed & Channel",
      "Tara's 7-Day Challenge",
      "Access to Tara's Corner",
      "Access to Practice Sheet",
    ],
  },
  {
    tier: "suite",
    name: "Suite",
    desc: "Your way into the VIP community, plus a first taste of 1:1 coaching with a TSS Master Coach.",
    features: [
      "Everything in Lite, plus",
      "VIP Community Access",
      "Backstage Challenges & Events",
      "Tarabytes Exclusive Access",
      "12+ Mini Courses",
      "Bonus: your first 1:1 coaching session with a TSS Master Coach",
    ],
  },
  {
    tier: "pro",
    name: "Pro",
    desc: "For the serious singer — vocal athletes and working professionals training every week.",
    features: [
      "Everything in Suite, plus",
      "1:1 private 30-min coaching session with a TSS Master Coach (4 sessions/month)",
      "Sing Like a Superstar (8-week mastercourse)",
      "Riffs & Runs (6-week mastercourse)",
      "Access to the TSS Vocal Exercises Library",
      "First access to new courses, exercises & events",
    ],
    yearlyBonuses: ["Instareaction", "Private Vocal Artistry Session", "Semi-Private Vocal Session with Tara"],
  },
  {
    tier: "elite",
    name: "Elite",
    desc: "For the Vocal Superstars ready to go all-in on their singing career — by application only.",
    features: [
      "Everything in Pro, plus",
      "Tara's Monthly Masterclass",
      "Collaboration & Promotion Opportunities",
      "Marketing & Branding Sessions — learn how to market yourself as an artist",
      "Vocal Artistry Sessions — everything you need as a professional singer",
      "Recording Opportunities",
    ],
    applyOnly: true,
  },
];

// What a student going FROM `current` TO a lower-ranked `target` loses —
// each tier's own feature list already only holds what THAT tier adds on
// top of the one below it (the "Everything in X, plus" line is a
// pointer, not a real perk, so it's filtered out here), so the lost set
// is just every tier strictly above target, up to and including current.
// Used only for the downgrade confirmation's "you'll lose access to…"
// list (app/billing/account/change-plan-client.tsx) — an upgrade or a
// same-tier reprice never calls this.
export function featuresLostGoingTo(current: Tier, target: Tier): string[] {
  if (TIER_RANK[target] >= TIER_RANK[current]) return [];
  return TIER_COPY.filter((t) => TIER_RANK[t.tier] > TIER_RANK[target] && TIER_RANK[t.tier] <= TIER_RANK[current])
    .flatMap((t) => t.features)
    .filter((f) => !f.toLowerCase().startsWith("everything in"));
}

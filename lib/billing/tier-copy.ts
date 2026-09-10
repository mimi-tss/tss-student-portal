import type { Tier } from "@/types/database";

// Feature text sourced from TSS_App_Spec_1.md section 2 ("Subscription
// Tiers") and its "Portal access by tier" table — not invented copy, so
// this stays accurate if either changes; update both together. Shared by
// the public pricing page and the account page's Change Plan picker, so
// the two never drift into different descriptions of the same tier.
export const TIER_COPY: { tier: Tier; name: string; desc: string; features: string[] }[] = [
  {
    tier: "lite",
    name: "Lite",
    desc: "Course access and community — no 1:1 coaching portal.",
    features: ["Practice sheet & 7-day challenge", "Community feed & channel", "All mini courses"],
  },
  {
    tier: "suite",
    name: "Suite",
    desc: "Weekly 1:1 lessons plus everything in Lite.",
    features: ["Everything in Lite", "One lifetime trial lesson with a coach", "VIP community feed & early access", "10% discount on add-ons"],
  },
  {
    tier: "pro",
    name: "Pro",
    desc: "More frequent coaching and priority scheduling.",
    features: ["Everything in Suite", "4 weekly 30-min coach lessons/month", "Mastercourse unlock after 1 year", "Exclusive group chat", "15% discount on add-ons"],
  },
  {
    tier: "elite",
    name: "Elite",
    desc: "Our most comprehensive coaching plan.",
    features: [
      "Everything in Pro",
      "Bi-annual group session with Tara",
      "2 lifetime success calls with Mimi",
      "1 lifetime onboarding/goal session",
      "Monthly 1:1 goal/marketing session",
    ],
  },
];

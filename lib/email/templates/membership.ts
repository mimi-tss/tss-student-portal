import { renderEmail, type EmailBlock } from "@/lib/email/layout";
import { STUDENT_APP_URL } from "@/lib/email/links";
import { TIER_COPY } from "@/lib/billing/tier-copy";
import { TIER_RANK } from "@/lib/stripe/tiers";
import type { Tier } from "@/types/database";

// Membership emails (studio call 2026-09-26): welcome on sign-up, and a
// note on every upgrade/downgrade. Account emails — always sent, can't be
// switched off. Plan names/features come from lib/billing/tier-copy.ts,
// the same copy the pricing page uses.

export const planName = (tier: Tier) => `Sing Smarter ${TIER_COPY.find((t) => t.tier === tier)?.name ?? tier}`;

const realFeatures = (tier: Tier) =>
  (TIER_COPY.find((t) => t.tier === tier)?.features ?? []).filter((f) => !f.toLowerCase().startsWith("everything in"));

// Everything a tier includes, spelled out (resolving "Everything in X,
// plus" into the actual lower-tier perks), highest tier's own perks first.
// Suite's one-off "first 1:1 session" bonus is dropped for Pro/Elite —
// they have weekly lessons, so it'd read as a strange extra.
function allFeatures(tier: Tier): string[] {
  return TIER_COPY.filter((t) => TIER_RANK[t.tier] <= TIER_RANK[tier] && t.tier !== "lite")
    .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier])
    .flatMap((t) => realFeatures(t.tier))
    .filter((f) => tier === "suite" || !/^bonus: your first 1:1/i.test(f));
}

// Welcome intro per plan — the pricing-page blurb doesn't always fit
// someone who has already joined (Elite's says "by application only").
const WELCOME_LINE: Record<Tier, string> = {
  lite: "",
  suite: "You're in the VIP community now, plus your first 1:1 Private Coaching Session with a TSS Master Coach.",
  pro: "You're training every week now with a TSS Master Coach, plus our full course and exercise library.",
  elite: "You're in! Get ready to go all-in on your singing career with Tara and the team.",
};

// What moving up from `from` to `to` adds.
function unlocked(from: Tier, to: Tier): string[] {
  return TIER_COPY.filter((t) => TIER_RANK[t.tier] > TIER_RANK[from] && TIER_RANK[t.tier] <= TIER_RANK[to]).flatMap((t) =>
    realFeatures(t.tier),
  );
}

const GET_STARTED: Record<Tier, string> = {
  lite: "",
  suite: "Open **Student Access** in the app to book your First 1:1 Coaching Session with a TSS Master Coach.",
  pro: "Open **Student Access** in the app to see your lessons, chat with your coach, and catch your recordings.",
  elite: "Open **Student Access** in the app to see your lessons, chat with your coach, and catch your recordings.",
};

export function welcomeEmail(i: { firstName: string; tier: Tier; accountUrl: string }) {
  const name = planName(i.tier);
  const subject = `Welcome to ${name}!`;
  const preheader = WELCOME_LINE[i.tier] || "Here's everything you need to get started.";
  const blocks: EmailBlock[] = [
    { type: "p", text: `We're so glad you're here. ${WELCOME_LINE[i.tier]}`.trim() },
    { type: "h2", text: "What's included" },
    { type: "list", items: allFeatures(i.tier).map((f) => `✓ ${f}`) },
    { type: "h2", text: "Get started" },
    { type: "p", text: GET_STARTED[i.tier] },
    { type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL },
    { type: "link", label: "Manage your membership →", url: i.accountUrl },
    { type: "note", text: "That link logs you straight into your billing account, no password needed. Keep this email handy." },
  ];
  return {
    subject,
    ...renderEmail({ preheader, heading: `Welcome to ${name}, ${i.firstName}!`, blocks, reason: "You're getting this because you just joined." }),
  };
}

// Repeat "here's your account link" email (the link rotates on every use).
export function accountLinkEmail(i: { accountUrl: string }) {
  return {
    subject: "Your Tara Simon Studios account link",
    ...renderEmail({
      preheader: "Tap to open your billing account, no password needed.",
      heading: "Here's your account link",
      blocks: [
        { type: "p", text: "Tap below to open your billing account, no password needed." },
        { type: "button", label: "OPEN MY ACCOUNT", url: i.accountUrl },
        { type: "note", text: "For your lessons, chat and recordings, use the Sing Smarter App." },
      ],
      reason: "You're getting this because you used your account link.",
    }),
  };
}

export function planChangedEmail(i: { firstName: string; from: Tier; to: Tier }) {
  const up = TIER_RANK[i.to] > TIER_RANK[i.from];
  const name = planName(i.to);
  const subject = up ? `You're now on ${name}!` : `Your plan is now ${name}`;
  const preheader = up ? "Here's everything you've just unlocked." : `Your membership has changed to ${name}.`;
  const blocks: EmailBlock[] = up
    ? [
        { type: "p", text: `Your upgrade from ${planName(i.from)} to **${name}** is all set.` },
        { type: "h2", text: "What you've unlocked" },
        { type: "list", items: unlocked(i.from, i.to).map((f) => `✨ ${f}`) },
        { type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL },
      ]
    : [
        { type: "p", text: `Your membership has changed from ${planName(i.from)} to **${name}**.` },
        { type: "h2", text: "Your plan includes" },
        { type: "list", items: allFeatures(i.to).map((f) => `✓ ${f}`) },
        { type: "p", text: "Want to move back up any time? You can change your plan from your account." },
        { type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL },
      ];
  const r = renderEmail({
    preheader,
    heading: up ? `Welcome to ${name}, ${i.firstName}!` : `Your plan has changed, ${i.firstName}`,
    blocks,
    reason: "You're getting this because your membership changed.",
  });
  return { subject, preheader, ...r, sms: "", bellTitle: subject, bellBody: preheader };
}

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
// Also dropped for a Suite student who isn't getting one (returning
// student, or a downgrade — lib/billing/first-session.ts).
const isFirstSessionLine = (f: string) => /^bonus: your first 1:1/i.test(f);
function allFeatures(tier: Tier, firstSession = tier === "suite"): string[] {
  return TIER_COPY.filter((t) => TIER_RANK[t.tier] <= TIER_RANK[tier] && t.tier !== "lite")
    .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier])
    .flatMap((t) => realFeatures(t.tier))
    .filter((f) => (tier === "suite" && firstSession) || !isFirstSessionLine(f));
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

// Suite without the first session (returning student).
const SUITE_WELCOME_RETURNING = "Welcome back to the VIP community!";
const SUITE_GET_STARTED_RETURNING = "Log in to the app to dive into Backstage, Tarabytes and the mini courses.";

const GET_STARTED: Record<Tier, string> = {
  lite: "",
  suite: "Open **Student Access** in the app to book your First 1:1 Coaching Session with a TSS Master Coach.",
  pro: "Open **Student Access** in the app to see your lessons, chat with your coach, and catch your recordings.",
  elite: "Open **Student Access** in the app to see your lessons, chat with your coach, and catch your recordings.",
};

// "Want more coaching?" — Suite add-ons, no prices (studio call
// 2026-10-08), in the Suite welcome and the move-to-Suite email. Anything
// they already bought shows under "Your add-ons" instead; owning either
// bi-weekly option hides both. The button goes to the website add-ons
// page (purchases stay web-only, never the Kajabi app).
const SUITE_ADDON_OFFERS: { id: string; line: string }[] = [
  { id: "biweekly_30min_suite", line: "**30-min Bi-weekly Lessons**: 2 private lessons a month" },
  { id: "biweekly_60min_suite", line: "**60-min Bi-weekly Lessons**: 2 private lessons a month" },
  { id: "four_pack_30min", line: "**4-Pack 30-min Lessons**: book anytime within a year" },
  { id: "four_pack_group_class", line: "**4-Pack Group Classes**: 4 group classes within a year" },
];
const ADDON_NAMES: Record<string, string> = {
  biweekly_30min_suite: "30-min Bi-weekly Lessons",
  biweekly_60min_suite: "60-min Bi-weekly Lessons",
  four_pack_30min: "4-Pack 30-min Lessons",
  four_pack_group_class: "4-Pack Group Classes",
};
export function suiteAddonBlocks(ownedAddonIds: string[] = []): EmailBlock[] {
  const owned = new Set(ownedAddonIds);
  const hasBiweekly = owned.has("biweekly_30min_suite") || owned.has("biweekly_60min_suite");
  const offers = SUITE_ADDON_OFFERS.filter((o) => !owned.has(o.id) && !(hasBiweekly && o.id.startsWith("biweekly_")));
  const mine = [...owned].map((id) => ADDON_NAMES[id]).filter(Boolean);
  const blocks: EmailBlock[] = [];
  if (mine.length) blocks.push({ type: "h2", text: "Your add-ons" }, { type: "list", items: mine.map((m) => `✓ ${m}`) });
  if (offers.length) {
    blocks.push(
      { type: "h2", text: "Want more coaching?" },
      { type: "p", text: "Add any of these to your Suite membership:" },
      { type: "list", items: offers.map((o) => `✓ ${o.line}`) },
      { type: "link", label: "See add-ons →", url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/addons` },
    );
  }
  return blocks;
}

// firstSession: false for a Suite member who isn't getting the free first
// session (they've had sessions with us before).
export function welcomeEmail(i: { firstName: string; tier: Tier; accountUrl: string; firstSession?: boolean; ownedAddonIds?: string[] }) {
  const name = planName(i.tier);
  const returningSuite = i.tier === "suite" && i.firstSession === false;
  const intro = returningSuite ? SUITE_WELCOME_RETURNING : WELCOME_LINE[i.tier];
  const subject = `Welcome to ${name}!`;
  const preheader = intro || "Here's everything you need to get started.";
  const blocks: EmailBlock[] = [
    { type: "p", text: `We're so glad you're here. ${intro}`.trim() },
    { type: "h2", text: "What's included" },
    { type: "list", items: allFeatures(i.tier, !returningSuite).map((f) => `✓ ${f}`) },
    { type: "h2", text: "Get started" },
    { type: "p", text: returningSuite ? SUITE_GET_STARTED_RETURNING : GET_STARTED[i.tier] },
    { type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL },
    ...(i.tier === "suite" ? suiteAddonBlocks(i.ownedAddonIds) : []),
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

// biweeklyCoachFirstName: moving to Suite while keeping the bi-weekly
// 30-min lesson add-on (studio call 2026-10-08) — say the lessons
// continue, so it doesn't read like they lost them.
export function planChangedEmail(i: {
  firstName: string;
  from: Tier;
  to: Tier;
  biweeklyCoachFirstName?: string | null;
  ownedAddonIds?: string[];
}) {
  const up = TIER_RANK[i.to] > TIER_RANK[i.from];
  const keepsLessons = !up && i.to === "suite" && !!i.biweeklyCoachFirstName;
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
        {
          type: "p",
          text: keepsLessons
            ? `Your membership is now **${name}**, and your 30-min lessons with **Coach ${i.biweeklyCoachFirstName}** continue every other week.`
            : `Your membership has changed from ${planName(i.from)} to **${name}**.`,
        },
        { type: "h2", text: "Your plan includes" },
        // A downgrade never includes the first-session bonus.
        {
          type: "list",
          items: [
            ...(keepsLessons ? [`Bi-weekly 30-min Private Coaching Session with Coach ${i.biweeklyCoachFirstName}`] : []),
            ...allFeatures(i.to, false),
          ].map((f) => `✓ ${f}`),
        },
        {
          type: "p",
          text: keepsLessons
            ? "Want weekly lessons again? You can change your plan from your account any time."
            : "Want to move back up any time? You can change your plan from your account.",
        },
        { type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL },
        ...(i.to === "suite" ? suiteAddonBlocks(i.ownedAddonIds) : []),
      ];
  const r = renderEmail({
    preheader,
    heading: up ? `Welcome to ${name}, ${i.firstName}!` : `Your plan has changed, ${i.firstName}`,
    blocks,
    reason: "You're getting this because your membership changed.",
  });
  return { subject, preheader, ...r, sms: "", bellTitle: subject, bellBody: preheader };
}

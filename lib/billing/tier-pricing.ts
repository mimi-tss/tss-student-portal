import type { Tier } from "@/types/database";

// List (monthly) price per tier — not synced from Kajabi: pricing still
// lives on the old platform, nothing pushes a real dollar amount into
// Kajabi or this app yet (see PROGRESS.md). These are the admin-supplied
// current monthly rates, used only for Reports-page revenue estimates.
// Deliberately does NOT account for the discounted 3/6/12-month prepay
// options — the app has no field tracking which billing frequency a
// given student is actually on, so every revenue figure derived from
// this is a monthly-list-price estimate, not a reconciled number. Treat
// it as directional, not a books-of-record replacement.
export const TIER_PRICE_MONTHLY: Record<Tier, number> = {
  lite: 0,
  suite: 29.99,
  pro: 399,
  elite: 599,
};

export function tierMonthlyPrice(tier: string): number {
  return TIER_PRICE_MONTHLY[tier as Tier] ?? 0;
}

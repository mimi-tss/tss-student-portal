import type Stripe from "stripe";

// The 4-state UI status the billing account page shows — finer-grained
// than the 3-state subscription_status enum this app's schema stores
// (active/paused/cancelled, no past_due — that's payment_status='dnc'
// locally, see app/api/webhooks/stripe/route.ts's own
// deriveSubscriptionStatus). This one is derived live from Stripe for
// display, not written to the DB.
export type BillingDisplayStatus = "active" | "paused" | "past_due" | "canceled";

export function deriveDisplayStatus(subscription: Stripe.Subscription): BillingDisplayStatus {
  if (subscription.pause_collection) return "paused";
  if (subscription.status === "canceled") return "canceled";
  if (subscription.status === "past_due" || subscription.status === "unpaid") return "past_due";
  return "active";
}

export const STATUS_LABEL: Record<BillingDisplayStatus, string> = {
  active: "Active",
  paused: "Paused",
  past_due: "Past Due",
  canceled: "Canceled",
};

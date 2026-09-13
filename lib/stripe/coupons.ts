import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";

export interface ResolvedPromotionCode {
  promotionCode: Stripe.PromotionCode;
  coupon: Stripe.Coupon;
}

// Coupons/Promotion Codes are managed directly in the Stripe Dashboard
// ("own" account only, same as every add-on Price) — no admin UI in this
// app for creating them. A student enters the code they were given; this
// resolves it to the real Stripe objects whose math actually gets
// applied (lib/billing/addons.ts's applyCouponToAmount for a one-time
// purchase, or the promotion code id passed straight through as a
// subscription-item discount for a recurring add-on — see
// app/api/billing/addons/{purchase,toggle}/route.ts). Returns null for
// an unknown, inactive, or expired code rather than throwing — callers
// treat a bad code as "no discount, charge full price," not a hard
// error, so a typo doesn't block the purchase outright.
//
// A PromotionCode's own `promotion.coupon` field is a plain Coupon id
// unless expanded — `data.promotion.coupon` pulls the real object back
// in the same list call rather than a second round-trip.
export async function resolvePromotionCode(code: string): Promise<ResolvedPromotionCode | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const result = await getStripeClient("own").promotionCodes.list({
    code: trimmed,
    active: true,
    limit: 1,
    expand: ["data.promotion.coupon"],
  });

  const promotionCode = result.data[0];
  const coupon = promotionCode?.promotion.coupon;
  if (!promotionCode || !coupon || typeof coupon === "string" || !coupon.valid) return null;

  return { promotionCode, coupon };
}

import { NextRequest, NextResponse } from "next/server";
import { createSubscriptionCheckoutSession } from "@/lib/stripe/checkout";
import type { Tier } from "@/types/database";

// Elite is application-only (see lib/billing/tier-copy.ts) — the public
// pricing page sends it to a mailto instead of Checkout, and this rejects
// a direct POST too.
const VALID_TIERS: Tier[] = ["lite", "suite", "pro"];

// Unauthenticated by design — this is the public signup path (new
// student, no account yet). Stripe Checkout is fully hosted: no card
// data ever touches this codebase, so there's nothing here to protect
// beyond picking a valid tier/interval. Always pulls from
// STRIPE_PRICE_BY_TIER (the current, public price) — never from a price
// ID supplied by the client — which is what keeps every grandfathered/
// legacy price invisible here regardless of how many exist in Stripe.
// Session-building itself lives in lib/stripe/checkout.ts, shared with
// admin's own "generate a real subscription" action.
export async function POST(req: NextRequest) {
  const { tier, interval = "monthly", addonIds } = await req.json();

  if (typeof tier !== "string" || !VALID_TIERS.includes(tier as Tier)) {
    return NextResponse.json({ error: "A valid tier is required" }, { status: 400 });
  }

  const result = await createSubscriptionCheckoutSession({ tier: tier as Tier, interval, addonIds });
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ url: result.url });
}

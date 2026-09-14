import { NextRequest, NextResponse } from "next/server";
import { addonsForTier, resolveAddonPriceId } from "@/lib/billing/addons";
import { getStripeClient } from "@/lib/stripe/client";
import type { Tier } from "@/types/database";

const VALID_TIERS: Tier[] = ["lite", "suite", "pro", "elite"];

// Unauthenticated by design, like checkout/route.ts — lists a tier's
// add-on catalog with live Stripe pricing BEFORE a subscription exists,
// for the pre-checkout add-ons step (app/billing/addons-select). Unlike
// .../addons/route.ts (which needs a real subscription to report
// active/canAdd/canRemove for an existing student), this only ever
// answers "what's buyable for this tier and what does it cost" — no
// student, no auth, no state.
export async function GET(req: NextRequest) {
  const tier = req.nextUrl.searchParams.get("tier");
  if (!tier || !VALID_TIERS.includes(tier as Tier)) {
    return NextResponse.json({ error: "A valid tier is required" }, { status: 400 });
  }

  const catalog = addonsForTier(tier as Tier);

  const addons = await Promise.all(
    catalog.map(async (def) => {
      const priceId = resolveAddonPriceId(def, tier as Tier);
      let price = null;
      if (priceId) {
        try {
          price = await getStripeClient("own").prices.retrieve(priceId);
        } catch {
          price = null;
        }
      }
      return {
        id: def.id,
        label: def.label,
        description: def.description ?? null,
        kind: def.kind,
        amount: price?.unit_amount ?? null,
        currency: price?.currency ?? null,
        interval: price?.recurring?.interval ?? null,
        available: !!price,
      };
    }),
  );

  return NextResponse.json({ tier, addons });
}

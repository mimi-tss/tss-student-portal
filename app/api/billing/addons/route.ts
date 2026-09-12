import { NextResponse } from "next/server";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { addonsForTier, resolveAddonPriceId, resolveAddonFromPrice } from "@/lib/billing/addons";
import { getStripeClient } from "@/lib/stripe/client";
import { resolveTierFromPrice } from "@/lib/stripe/tiers";

// Lists the add-ons available for the student's current tier. Two very
// different shapes share this one response:
//
// - "recurring" (a second subscription item, toggled on/off): active is
//   read off the real subscription's items by Price metadata
//   (resolveAddonFromPrice), not a fixed Price ID — a legacy
//   (Opus-account) student can already have one on an old Price this app
//   never created. Adding a NEW item only ever uses the current "own"
//   Price — Opus isn't meant to gain new priced items.
// - "one_time" (a straight off-session charge, see .../purchase/route.ts):
//   no ongoing state at all — buyable repeatedly by design (e.g.
//   Spotlight, purchased fresh for every recital), so there's no
//   active/canRemove for these, just a price and whether it's configured.
export async function GET() {
  try {
    const billingStudent = await resolveBillingStudent();
    if (!billingStudent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!billingStudent.stripeSubscriptionId || !billingStudent.stripeAccount) {
      return NextResponse.json({ tier: null, addons: [] });
    }

    const client = getStripeClient(billingStudent.stripeAccount);
    const subscription = await client.subscriptions.retrieve(billingStudent.stripeSubscriptionId, {
      expand: ["items.data.price"],
    });

    const planItem = subscription.items.data[0];
    const tier = resolveTierFromPrice(planItem?.price);
    const catalog = addonsForTier(tier);
    const isOwnAccount = billingStudent.stripeAccount === "own";

    const activeItemByAddonId = new Map(
      subscription.items.data
        .slice(1)
        .map((item) => [resolveAddonFromPrice(item.price)?.id, item] as const)
        .filter(([id]) => !!id),
    );

    const addons = await Promise.all(
      catalog.map(async (def) => {
        const currentPriceId = resolveAddonPriceId(def);
        const activeItem = def.kind === "recurring" ? activeItemByAddonId.get(def.id) : undefined;
        const active = !!activeItem;

        // The catalog Price never lives on Opus — looked up through the
        // "own" account specifically (not the student's own account
        // client) so it resolves even before an Opus-linked student has
        // anything active yet.
        let price = active && activeItem && typeof activeItem.price !== "string" ? activeItem.price : null;
        if (!price && currentPriceId) {
          price = await getStripeClient("own").prices.retrieve(currentPriceId);
        }

        const base = {
          id: def.id,
          label: def.label,
          description: def.description ?? null,
          kind: def.kind,
          amount: price?.unit_amount ?? null,
          currency: price?.currency ?? null,
          interval: price?.recurring?.interval ?? null,
        };

        if (def.kind === "one_time") {
          return {
            ...base,
            canPurchase: !!currentPriceId,
            requiresGroupLessonSpot: !!def.requiresGroupLessonSpot,
          };
        }

        return {
          ...base,
          active,
          // Can start a NEW add-on only with a configured "own" Price,
          // and only for a student already on the "own" account.
          canAdd: isOwnAccount && !!currentPriceId,
          // Removing an existing item never needs a fresh Price lookup —
          // works regardless of which account it's actually on.
          canRemove: true,
        };
      }),
    );

    return NextResponse.json({ tier, addons });
  } catch (err) {
    console.error("GET /api/billing/addons failed", err);
    const message = err instanceof Error ? err.message : "Something went wrong loading your add-ons.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

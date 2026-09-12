import { NextResponse } from "next/server";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { addonsForTier, resolveAddonPriceId, resolveAddonFromPrice } from "@/lib/billing/addons";
import { getStripeClient } from "@/lib/stripe/client";
import { resolveTierFromPrice } from "@/lib/stripe/tiers";

// Lists the add-ons available for the student's current tier, whether
// each is currently active, and whether it can be self-serve toggled.
// "Active" is read off the real subscription's items by Price metadata
// (resolveAddonFromPrice) rather than a fixed Price ID — a legacy
// (Opus-account) student can already have one of these on an old Price
// this app never created. Adding a NEW item, though, only ever uses the
// current "own"-account Price (resolveAddonPriceId) — Opus isn't meant
// to gain new priced items, only keep whatever it already has until that
// student migrates (see change-plan-client.tsx's own migration path).
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
        const activeItem = activeItemByAddonId.get(def.id);
        const active = !!activeItem;
        const currentPriceId = resolveAddonPriceId(def);

        // Only fetches the catalog Price (to show a price tag before
        // anyone's added it) via the "own" account specifically — that
        // Price never lives on Opus, so looking it up through an
        // Opus-linked student's own client would 404.
        let price = active && activeItem && typeof activeItem.price !== "string" ? activeItem.price : null;
        if (!price && currentPriceId) {
          price = await getStripeClient("own").prices.retrieve(currentPriceId);
        }

        return {
          id: def.id,
          label: def.label,
          active,
          // Can start a NEW add-on only with a configured "own" Price,
          // and only for a student already on the "own" account.
          canAdd: isOwnAccount && !!currentPriceId,
          // Removing an existing item never needs a fresh Price lookup —
          // works regardless of which account it's actually on.
          canRemove: true,
          amount: price?.unit_amount ?? null,
          currency: price?.currency ?? null,
          interval: price?.recurring?.interval ?? null,
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

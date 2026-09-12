import { NextResponse } from "next/server";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { addonsForTier, resolveAddonPriceId } from "@/lib/billing/addons";
import { getStripeClient } from "@/lib/stripe/client";
import { resolveTierFromPrice } from "@/lib/stripe/tiers";

// Lists the add-ons available for the student's current tier plus whether
// each is currently active (a subscription item on their subscription
// whose price matches that add-on's own Price). Not read from any local
// mirror — tier and active items both come live off the real Stripe
// subscription, same posture as /api/billing/subscription.
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

    const addons = await Promise.all(
      catalog.map(async (def) => {
        const priceId = resolveAddonPriceId(def);
        if (!priceId) {
          return { id: def.id, label: def.label, available: false, active: false, amount: null, currency: null, interval: null };
        }

        const activeItem = subscription.items.data.find(
          (it) => (typeof it.price === "string" ? it.price : it.price.id) === priceId,
        );
        const price =
          activeItem && typeof activeItem.price !== "string" ? activeItem.price : await client.prices.retrieve(priceId);

        return {
          id: def.id,
          label: def.label,
          available: true,
          active: !!activeItem,
          amount: price.unit_amount,
          currency: price.currency,
          interval: price.recurring?.interval ?? null,
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

import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getStripeClient } from "@/lib/stripe/client";
import { formatPrice } from "@/lib/stripe/tiers";
import { addonsForTier, resolveAddonPriceId } from "@/lib/billing/addons";
import type { Tier } from "@/types/database";
import styles from "../../billing.module.css";

const LANDING_TIERS: Tier[] = ["suite", "pro", "elite"];
const TIER_LABEL: Record<Tier, string> = { lite: "Lite", suite: "Suite", pro: "Pro", elite: "Elite" };

function isLandingTier(value: string): value is Tier {
  return (LANDING_TIERS as string[]).includes(value);
}

// Public, shareable per-tier add-on catalog (e.g. a Suite-only promo
// link) — shows pricing and copy before anyone logs in, unlike
// /billing/addons which is gated to an existing signed-in student
// managing what's already on their subscription. Nested under
// /billing/addons/[tier] (not a top-level /addons/[tier]) specifically
// so it inherits billing/layout.tsx's theme tokens, fonts, and branded
// header for free, same as every other page on this site (first version
// lived outside /billing and rendered completely unstyled — no CSS
// variables in scope outside that layout's .root wrapper). Never talks
// to the toggle/purchase routes itself: only reads catalog + live
// "own"-account Price data (public, no customer identifiers) and links
// out to the real authed page for the actual add/remove/buy action. An
// already-logged-in visitor skips the login prompt entirely and goes
// straight to /billing/addons, which resolves their REAL tier
// server-side — the tier in this URL is only ever a marketing label,
// never trusted as their actual plan.
export default async function AddonsTierLandingPage({ params }: { params: Promise<{ tier: string }> }) {
  const { tier: rawTier } = await params;
  if (!isLandingTier(rawTier)) notFound();
  const tier = rawTier;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const catalog = addonsForTier(tier);
  const client = getStripeClient("own");
  const addons = await Promise.all(
    catalog.map(async (def) => {
      const priceId = resolveAddonPriceId(def, tier);
      const price = priceId ? await client.prices.retrieve(priceId).catch(() => null) : null;
      return {
        id: def.id,
        label: def.label,
        description: def.description ?? null,
        kind: def.kind,
        amount: price?.unit_amount ?? null,
        currency: price?.currency ?? null,
        interval: price?.recurring?.interval ?? null,
      };
    }),
  );

  const ctaHref = user ? "/billing/addons" : "/billing/login?next=/billing/addons";
  const ctaLabel = user ? "Manage your add-ons →" : "Log in to purchase →";

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>{TIER_LABEL[tier]} Add-Ons</h1>
      <p className={styles.subtitle}>Add more coaching to your {TIER_LABEL[tier]} plan.</p>

      <div className={styles.addonGrid}>
        {addons.map((addon) => (
          <div key={addon.id} className={styles.tierCard} style={{ textAlign: "center", alignItems: "center" }}>
            <span className={styles.badge}>{addon.kind === "recurring" ? "Monthly" : "One-time"}</span>
            <div className={styles.tierName} style={{ fontSize: 17 }}>
              {addon.label}
            </div>
            <div className={styles.tierPrice} style={{ fontSize: 24 }}>
              {addon.amount != null ? formatPrice(addon.amount, addon.currency) ?? "—" : "—"}
              {addon.interval && <span className={styles.tierPriceSub}> / {addon.interval}</span>}
            </div>
            {addon.description && <p className={styles.tierDesc}>{addon.description}</p>}
          </div>
        ))}
      </div>

      <div style={{ textAlign: "center", marginTop: 32 }}>
        <Link href={ctaHref} className={styles.cta}>
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}

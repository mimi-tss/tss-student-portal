"use client";

import { useEffect, useState } from "react";
import styles from "./billing.module.css";
import type { Tier } from "@/types/database";
import type { BillingInterval } from "@/lib/stripe/tiers";
import { TIER_COPY, ELITE_APPLICATION_EMAIL } from "@/lib/billing/tier-copy";
import { TierCard, type TierPricing } from "./tier-card";

type PricingData = Record<Tier, TierPricing>;

// Each tier's interval toggle only ever shows the intervals that
// actually have a price configured for it (BILLING_INTERVALS.filter
// below) — a tier with just monthly, or a limited-time 3/6-month promo
// on top of monthly/yearly, both render correctly with no special-casing.
export default function PricingClient() {
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [interval, setInterval] = useState<Record<Tier, BillingInterval>>({
    lite: "monthly",
    suite: "monthly",
    pro: "monthly",
    elite: "monthly",
  });
  const [loadingTier, setLoadingTier] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/billing/pricing")
      .then((res) => res.json())
      .then((data) => setPricing(data.pricing ?? null))
      .catch(() => setPricing(null));
  }, []);

  async function choose(tier: Tier) {
    setLoadingTier(tier);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval: interval[tier] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        setError(data?.error ?? "Couldn't start checkout — try again.");
        setLoadingTier(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Couldn't start checkout — try again.");
      setLoadingTier(null);
    }
  }

  return (
    <div>
      {error && <p className={styles.errorText}>{error}</p>}
      <div className={styles.tierGrid}>
        {TIER_COPY.map((t) => {
          const price = pricing?.[t.tier]?.[interval[t.tier]] ?? null;
          return (
            <TierCard
              key={t.tier}
              tier={t}
              prices={pricing?.[t.tier]}
              selectedInterval={interval[t.tier]}
              onSelectInterval={(i) => setInterval((prev) => ({ ...prev, [t.tier]: i }))}
              action={
                t.applyOnly ? (
                  <a
                    className={styles.cta}
                    style={{ display: "block", textAlign: "center", textDecoration: "none" }}
                    href={`mailto:${ELITE_APPLICATION_EMAIL}?subject=${encodeURIComponent(`${t.name} application`)}`}
                  >
                    Contact us
                  </a>
                ) : (
                  <button className={styles.cta} disabled={loadingTier !== null || !price} onClick={() => choose(t.tier)}>
                    {loadingTier === t.tier ? "Starting…" : `Choose ${t.name}`}
                  </button>
                )
              }
            />
          );
        })}
      </div>
    </div>
  );
}

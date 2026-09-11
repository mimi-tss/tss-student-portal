"use client";

import { useEffect, useState } from "react";
import styles from "./billing.module.css";
import type { Tier } from "@/types/database";
import { formatPrice, BILLING_INTERVALS, INTERVAL_LABEL, type BillingInterval } from "@/lib/stripe/tiers";
import { TIER_COPY, ELITE_APPLICATION_EMAIL } from "@/lib/billing/tier-copy";

interface PriceInfo {
  amount: number | null;
  currency: string | null;
}
type PricingData = Record<Tier, Record<BillingInterval, PriceInfo | null>>;

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
          const prices = pricing?.[t.tier];
          const availableIntervals = BILLING_INTERVALS.filter((i) => prices?.[i]);
          const selected = interval[t.tier];
          const price = prices?.[selected] ?? null;

          return (
            <div key={t.tier} className={styles.tierCard}>
              <div className={styles.tierName}>{t.name}</div>
              <p className={styles.tierDesc}>{t.desc}</p>

              <ul className={styles.featureList}>
                {t.features.map((f) => (
                  <li key={f} className={styles.featureItem}>
                    <span className={styles.featureCheck}>✓</span> {f}
                  </li>
                ))}
              </ul>

              {!t.applyOnly && availableIntervals.length > 1 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {availableIntervals.map((i) => (
                    <button
                      key={i}
                      type="button"
                      className={selected === i ? styles.badge : styles.linkBtn}
                      onClick={() => setInterval((prev) => ({ ...prev, [t.tier]: i }))}
                    >
                      {INTERVAL_LABEL[i]}
                    </button>
                  ))}
                </div>
              )}

              <div className={styles.tierName} style={{ fontSize: 22 }}>
                {t.applyOnly ? "Custom" : formatPrice(price?.amount, price?.currency) ?? "—"}
                {!t.applyOnly && price && price.amount !== 0 && (
                  <span className={styles.statLabel} style={{ fontSize: 13 }}>
                    {" "}
                    / {INTERVAL_LABEL[selected]}
                  </span>
                )}
              </div>

              {t.applyOnly ? (
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

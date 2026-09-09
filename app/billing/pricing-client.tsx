"use client";

import { useEffect, useState } from "react";
import styles from "./billing.module.css";
import type { Tier } from "@/types/database";
import type { BillingInterval } from "@/lib/stripe/tiers";

const TIERS: { tier: Tier; name: string; desc: string }[] = [
  { tier: "lite", name: "Lite", desc: "Course access and community — no 1:1 coaching portal." },
  { tier: "suite", name: "Suite", desc: "Weekly 1:1 lessons plus everything in Lite." },
  { tier: "pro", name: "Pro", desc: "More frequent coaching and priority scheduling." },
  { tier: "elite", name: "Elite", desc: "Our most comprehensive coaching plan." },
];

interface PriceInfo {
  amount: number | null;
  currency: string | null;
}
type PricingData = Record<Tier, { monthly: PriceInfo | null; yearly: PriceInfo | null }>;

function formatAmount(price: PriceInfo | null) {
  if (price == null || price.amount == null || price.currency == null) return null;
  if (price.amount === 0) return "Free";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: price.currency.toUpperCase() }).format(
    price.amount / 100,
  );
}

// Each tier gets its own monthly/yearly toggle (not one global switch) —
// a tier without a yearly price configured (e.g. a free Lite tier) just
// never shows a toggle at all, rather than a global switch needing to
// special-case it.
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
        {TIERS.map((t) => {
          const prices = pricing?.[t.tier];
          const hasYearly = !!prices?.yearly;
          const selected = interval[t.tier];
          const price = prices?.[selected] ?? null;

          return (
            <div key={t.tier} className={styles.tierCard}>
              <div className={styles.tierName}>{t.name}</div>
              <p className={styles.tierDesc}>{t.desc}</p>

              {hasYearly && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className={selected === "monthly" ? styles.badge : styles.linkBtn}
                    onClick={() => setInterval((prev) => ({ ...prev, [t.tier]: "monthly" }))}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    className={selected === "yearly" ? styles.badge : styles.linkBtn}
                    onClick={() => setInterval((prev) => ({ ...prev, [t.tier]: "yearly" }))}
                  >
                    Yearly
                  </button>
                </div>
              )}

              <div className={styles.tierName} style={{ fontSize: 22 }}>
                {formatAmount(price) ?? "—"}
                {price && price.amount !== 0 && (
                  <span className={styles.statLabel} style={{ fontSize: 13 }}>
                    {" "}
                    / {selected === "monthly" ? "mo" : "yr"}
                  </span>
                )}
              </div>

              <button className={styles.cta} disabled={loadingTier !== null || !price} onClick={() => choose(t.tier)}>
                {loadingTier === t.tier ? "Starting…" : `Choose ${t.name}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./billing.module.css";
import type { Tier } from "@/types/database";
import { BILLING_INTERVALS, type BillingInterval } from "@/lib/stripe/tiers";
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
  const searchParams = useSearchParams();
  const autoFired = useRef(false);

  useEffect(() => {
    fetch("/api/billing/pricing")
      .then((res) => res.json())
      .then((data) => setPricing(data.pricing ?? null))
      .catch(() => setPricing(null));
  }, []);

  // Deep-link support for external landing pages (e.g. the Sing Smarter
  // Lite/Suite GHL funnels): ?tier=suite skips straight to that tier's
  // checkout instead of making the visitor pick it again after already
  // choosing it on the funnel page. An optional ?interval=yearly (or
  // any other BillingInterval) picks which price to check out with —
  // without this, a funnel's "$299/yr" CTA would silently check out the
  // visitor on the monthly price instead, since interval state here
  // otherwise always starts at "monthly". Only fires once pricing has
  // loaded (so we know a price actually exists for the tier/interval
  // pair), only for a real checkout-eligible tier (never Elite's
  // applyOnly/mailto card), and only once per page load.
  useEffect(() => {
    if (autoFired.current || !pricing) return;
    const requestedTier = searchParams.get("tier");
    const tierCopy = TIER_COPY.find((t) => t.tier === requestedTier);
    if (!tierCopy || tierCopy.applyOnly) return;
    const requestedInterval = searchParams.get("interval");
    const resolvedInterval: BillingInterval = (BILLING_INTERVALS as string[]).includes(requestedInterval ?? "")
      ? (requestedInterval as BillingInterval)
      : interval[tierCopy.tier];
    if (!pricing[tierCopy.tier]?.[resolvedInterval]) return;
    autoFired.current = true;
    setInterval((prev) => ({ ...prev, [tierCopy.tier]: resolvedInterval }));
    choose(tierCopy.tier, resolvedInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricing]);

  async function choose(tier: Tier, intervalOverride?: BillingInterval) {
    setLoadingTier(tier);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval: intervalOverride ?? interval[tier] }),
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

"use client";

import type { ReactNode } from "react";
import type { Tier } from "@/types/database";
import { formatPrice, BILLING_INTERVALS, INTERVAL_LABEL, INTERVAL_MONTHS, type BillingInterval } from "@/lib/stripe/tiers";
import type { TIER_COPY } from "@/lib/billing/tier-copy";
import styles from "./billing.module.css";

interface PriceInfo {
  amount: number | null;
  currency: string | null;
}
export type TierPricing = Record<BillingInterval, PriceInfo | null>;

// One tier card — shared by the public pricing page (pricing-client.tsx)
// and the account page's Change Plan picker (change-plan-client.tsx), so
// the interval/savings math and the "Your Plan" ribbon only exist once.
// The action button differs per caller (start Checkout vs. select a
// target tier vs. a Contact-us mailto for the applyOnly tier), so that's
// the one thing passed in rather than owned here.
export function TierCard({
  tier,
  prices,
  selectedInterval,
  onSelectInterval,
  isCurrent = false,
  highlighted = false,
  action,
}: {
  tier: (typeof TIER_COPY)[number];
  prices: TierPricing | undefined;
  selectedInterval: BillingInterval;
  onSelectInterval: (interval: BillingInterval) => void;
  isCurrent?: boolean;
  highlighted?: boolean;
  action: ReactNode;
}) {
  const availableIntervals = BILLING_INTERVALS.filter((i) => prices?.[i]);
  const price = prices?.[selectedInterval] ?? null;
  const monthlyPrice = prices?.monthly ?? null;

  return (
    <div className={styles.tierCard} style={highlighted ? { outline: "2px solid var(--gold)", outlineOffset: 2 } : undefined}>
      {isCurrent && <div className={styles.currentRibbon}>Your plan</div>}
      <div className={styles.tierName}>{tier.name}</div>
      <p className={styles.tierDesc}>{tier.desc}</p>

      <ul className={styles.featureList}>
        {tier.features.map((f) => (
          <li key={f} className={styles.featureItem}>
            <span className={styles.featureCheck}>✓</span> {f}
          </li>
        ))}
      </ul>

      {!tier.applyOnly && availableIntervals.length > 1 && (
        <div className={styles.intervalRow}>
          {availableIntervals.map((i) => {
            const p = prices?.[i];
            const savePct =
              i !== "monthly" && monthlyPrice?.amount && p?.amount
                ? Math.round((1 - p.amount / INTERVAL_MONTHS[i] / monthlyPrice.amount) * 100)
                : null;
            return (
              <button
                key={i}
                type="button"
                className={selectedInterval === i ? styles.intervalPillActive : styles.intervalPill}
                onClick={() => onSelectInterval(i)}
              >
                <span>{INTERVAL_LABEL[i]}</span>
                {savePct != null && savePct > 0 && <span className={styles.saveBadge}>Save {savePct}%</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className={styles.tierName} style={{ fontSize: 22 }}>
        {tier.applyOnly ? "Custom" : (formatPrice(price?.amount, price?.currency) ?? "—")}
        {!tier.applyOnly && price && price.amount !== 0 && (
          <span className={styles.statLabel} style={{ fontSize: 13 }}>
            {" "}
            / {INTERVAL_LABEL[selectedInterval]}
          </span>
        )}
      </div>
      {!tier.applyOnly && selectedInterval !== "monthly" && price?.amount ? (
        <div className={styles.tierPriceSub}>
          {formatPrice(Math.round(price.amount / INTERVAL_MONTHS[selectedInterval]), price.currency)}/mo, billed
          every {INTERVAL_MONTHS[selectedInterval]} months
        </div>
      ) : null}

      {action}
    </div>
  );
}
